const crypto = require('crypto');
const { ethers } = require('ethers');

const ALGORITHM = 'aes-256-cbc';
// We use the environment variable defined in Part 1
const ENCRYPTION_KEY = process.env.PRIVATE_KEY_ENCRYPTION_SECRET; 
const IV_LENGTH = 16; // For AES, this is always 16

function getSecretKey() {
    if (!ENCRYPTION_KEY) {
        throw new Error('PRIVATE_KEY_ENCRYPTION_SECRET is not defined in environment variables');
    }
    // Hash the secret to ensure we always have a perfectly sized 32-byte key for AES-256
    return crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
}

function encrypt(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, getSecretKey(), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    // Format: iv:encrypted_data (both in hex)
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getSecretKey(), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}

function generateWallet() {
    // Generate a fresh random wallet using ethers
    const wallet = ethers.Wallet.createRandom();
    
    // Immediately encrypt the private key
    const encryptedPrivateKey = encrypt(wallet.privateKey);
    
    return {
        address: wallet.address,
        encryptedPrivateKey: encryptedPrivateKey
    };
}

module.exports = {
    encrypt,
    decrypt,
    generateWallet
};
