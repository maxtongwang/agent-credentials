// Encryption provider interface — pluggable encryption for credential storage.

export interface EncryptionProvider {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}
