use sha2::{Digest, Sha256};
use std::fs;
use std::io;
use std::path::Path;

pub fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

/// Writes through a sibling temporary file before replacing the destination.
/// Callers retain ownership of path validation and user-visible permissions.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "target has no parent"))?;
    fs::create_dir_all(parent)?;
    let temporary = parent.join(format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("artifact"),
        std::process::id()
    ));
    fs::write(&temporary, bytes)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(temporary, path)
}

#[cfg(test)]
mod tests {
    use super::sha256_hex;

    #[test]
    fn hashes_known_content() {
        assert_eq!(
            sha256_hex(b"StudyPilot"),
            "462a114ed888a93fd9bbea537640ada4fec6a33c1b3b90c3008ffa8b12c999e6"
        );
    }
}
