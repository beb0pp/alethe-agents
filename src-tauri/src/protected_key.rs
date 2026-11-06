//! Reads a key from a DPAPI file written by `ConvertFrom-SecureString` (current Windows user only).

use std::path::Path;

const MAX_FILE_BYTES: u64 = 64 * 1024;

#[tauri::command]
pub fn read_protected_key(path: String) -> Result<String, String> {
    let path = Path::new(path.trim());
    let meta = std::fs::metadata(path).map_err(|e| format!("Key file not readable: {e}"))?;
    if !meta.is_file() || meta.len() > MAX_FILE_BYTES {
        return Err("Key file must be a small regular file".into());
    }
    let bytes = std::fs::read(path).map_err(|e| format!("Key file not readable: {e}"))?;
    decode_protected_key(&file_text(&bytes)?)
}

/// Windows PowerShell may save the file as UTF-16LE or with a UTF-8 BOM.
fn file_text(bytes: &[u8]) -> Result<String, String> {
    if let Some(rest) = bytes.strip_prefix(&[0xFF_u8, 0xFE]) {
        return utf16le_to_string(rest);
    }
    let rest = bytes.strip_prefix(&[0xEF_u8, 0xBB, 0xBF]).unwrap_or(bytes);
    String::from_utf8(rest.to_vec()).map_err(|_| "Key file is not text".to_string())
}

fn decode_protected_key(text: &str) -> Result<String, String> {
    let blob = hex::decode(text.trim())
        .map_err(|_| "Key file is not in the ConvertFrom-SecureString format".to_string())?;
    let mut plain = unprotect(&blob)?;
    let decoded = utf16le_to_string(&plain);
    plain.fill(0);
    let key = decoded?.trim().to_string();
    if key.is_empty() {
        return Err("Key file is empty".into());
    }
    Ok(key)
}

fn utf16le_to_string(bytes: &[u8]) -> Result<String, String> {
    let pairs = bytes.chunks_exact(2);
    if !pairs.remainder().is_empty() {
        return Err("Text is not valid UTF-16".into());
    }
    let units: Vec<u16> = pairs
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect();
    String::from_utf16(&units).map_err(|_| "Text is not valid UTF-16".to_string())
}

#[cfg(windows)]
fn unprotect(blob: &[u8]) -> Result<Vec<u8>, String> {
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{CryptUnprotectData, CRYPT_INTEGER_BLOB};

    let input = CRYPT_INTEGER_BLOB {
        cbData: blob.len() as u32,
        pbData: blob.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    // SAFETY: `input` points at a live slice for the duration of the call; DPAPI only reads it.
    let ok = unsafe {
        CryptUnprotectData(
            &input,
            std::ptr::null_mut(),
            std::ptr::null(),
            std::ptr::null(),
            std::ptr::null(),
            0,
            &mut output,
        )
    };
    if ok == 0 {
        return Err(
            "Could not decrypt the key file. It must be written by this Windows user.".into(),
        );
    }
    if output.pbData.is_null() {
        return Ok(Vec::new());
    }
    let len = output.cbData as usize;
    // SAFETY: on success `output` owns a LocalAlloc buffer of `len` bytes. It is copied, wiped and
    // released exactly once, and not touched afterwards.
    let bytes = unsafe {
        let copy = std::slice::from_raw_parts(output.pbData, len).to_vec();
        std::ptr::write_bytes(output.pbData, 0, len);
        LocalFree(output.pbData as _);
        copy
    };
    Ok(bytes)
}

#[cfg(not(windows))]
fn unprotect(_blob: &[u8]) -> Result<Vec<u8>, String> {
    Err("DPAPI key files are only supported on Windows".into())
}

#[cfg(test)]
mod text_tests {
    use super::*;

    #[test]
    fn reads_plain_and_utf8_bom_files() {
        assert_eq!(file_text(b"0a1b\r\n").unwrap(), "0a1b\r\n");
        assert_eq!(file_text(b"\xEF\xBB\xBF0a1b").unwrap(), "0a1b");
    }

    #[test]
    fn reads_utf16le_files_written_by_windows_powershell() {
        let utf16: Vec<u8> = [0xFF_u8, 0xFE]
            .into_iter()
            .chain("0a1b".encode_utf16().flat_map(u16::to_le_bytes))
            .collect();
        assert_eq!(file_text(&utf16).unwrap(), "0a1b");
    }

    #[test]
    fn rejects_utf16_with_a_dangling_byte() {
        assert!(utf16le_to_string(&[0x61, 0x00, 0x62]).is_err());
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{CryptProtectData, CRYPT_INTEGER_BLOB};

    fn protect_as_powershell(text: &str) -> String {
        let plain: Vec<u8> = text.encode_utf16().flat_map(u16::to_le_bytes).collect();
        let input = CRYPT_INTEGER_BLOB {
            cbData: plain.len() as u32,
            pbData: plain.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };
        let ok = unsafe {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                0,
                &mut output,
            )
        };
        assert_ne!(ok, 0, "CryptProtectData failed");
        let blob =
            unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
        unsafe { LocalFree(output.pbData as _) };
        hex::encode(blob)
    }

    #[test]
    fn decodes_a_key_written_like_convertfrom_securestring() {
        let file = format!("{}\r\n", protect_as_powershell("sk-test-123"));
        assert_eq!(decode_protected_key(&file).unwrap(), "sk-test-123");
    }

    #[test]
    fn rejects_text_that_is_not_a_hex_blob() {
        assert!(decode_protected_key("sk-plaintext-key").is_err());
    }

    #[test]
    fn rejects_a_blob_that_dpapi_cannot_open() {
        assert!(decode_protected_key("01000000d08c9ddf").is_err());
    }
}
