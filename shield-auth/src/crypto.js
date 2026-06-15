const { ethers } = require('ethers');
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
    const keyString = process.env.BLOCKCHAIN_ENCRYPTION_KEY;
    if (!keyString) {
        throw new Error('BLOCKCHAIN_ENCRYPTION_KEY environment variable is not set');
    }
    const key = Buffer.from(keyString, 'base64');
    if (key.length !== 32) {
        throw new Error('BLOCKCHAIN_ENCRYPTION_KEY must be a 32-byte base64 string');
    }
    return key;
}

/**
 * Generates a new random Ethereum wallet
 * @returns {{ address: string, privateKey: string }}
 */
function generateWallet() {
    const wallet = ethers.Wallet.createRandom();
    return {
        address: wallet.address,
        privateKey: wallet.privateKey
    };
}

/**
 * Encrypts a private key using AES-256-GCM
 * @param {string} privateKey - The plaintext private key (e.g. 0x...)
 * @returns {string} - The encrypted string format "iv:authTag:ciphertext"
 */
function encryptPrivateKey(privateKey) {
    if (!privateKey) throw new Error('Private key is required for encryption');
    
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let ciphertext = cipher.update(privateKey, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Return combined format: iv:authTag:ciphertext
    return `${iv.toString('hex')}:${authTag}:${ciphertext}`;
}

/**
 * Decrypts a previously encrypted private key
 * @param {string} encryptedString - Format "iv:authTag:ciphertext"
 * @returns {string} - The plaintext private key
 */
function decryptPrivateKey(encryptedString) {
    if (!encryptedString) throw new Error('Encrypted string is required for decryption');
    
    const key = getEncryptionKey();
    const parts = encryptedString.split(':');
    
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted string format. Expected iv:authTag:ciphertext');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const ciphertext = parts[2];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    
    return plaintext;
}

module.exports = {
    generateWallet,
    encryptPrivateKey,
    decryptPrivateKey
};
