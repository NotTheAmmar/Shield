    # Blockchain Wallet Integration Feature

    ## Feature Overview
    This feature upgrades the SHIELD user account database and signup routine. Blockchains identify users through a public address and a secret private key. Our backend now automatically creates these digital keys for every new officer profile upon registration via the admin portal.

    ### Benefits
    - **Immutable Chain of Custody:** Helps keep track of precisely "who did what and when" on the ledger.
    - **Seamless UX:** Officers do not need to install confusing crypto browser extensions (like MetaMask). They log in normally, and the backend safely handles their unique signature stamps.
    - **Non-repudiation:** Transactions are cryptographically signed by unique, user-level signature keys instead of a single global master key.

## How It Works
1. **Database Schema Update:** Two new columns were added to the PostgreSQL `users` table: `blockchain_address` and `encrypted_private_key`.
2. **Key Generation:** When an admin creates a new user, the system uses `ethers.js` (`ethers.Wallet.createRandom()`) to generate a fresh, secure random Ethereum wallet.
3. **Encryption:** The plain text private key is incredibly sensitive. Before saving, it is immediately encrypted using the AES-256-CBC standard in `shield-auth/src/cryptoUtils.js`.
4. **Environment Secret:** The encryption process is driven by a master secret `PRIVATE_KEY_ENCRYPTION_SECRET` securely stored in the server's `.env` file.
5. **Storage:** The raw private key is **never** stored or logged. Only the public `blockchain_address` and the `encrypted_private_key` are saved to the database.

## Security Considerations discussed
- **Password Resets:** Changing a user's web login password does not affect their blockchain wallet. The encryption relies on the server's `.env` master key, not the user's password.
- **Database Breaches:** If the database is compromised, the private keys remain secure because the hacker would also need the `.env` master secret from the server to decrypt them.
- **Physical Security (Unattended Workstations):** The blockchain proves *which account* authorized an action. To prevent someone from using a logged-in computer while the owner is away, the application should implement auto-timeouts and require password re-authentication for critical actions.

## How to Test the Feature
1. Ensure your environment is running (`npm run dev:full`).
2. Log into the SHIELD admin dashboard and create a new user account.
3. Verify that the keys were successfully generated and stored in the database by running the following command in your terminal. Replace `test.officer@shield.gov.in` with the email of the user you just created:

```bash
docker compose exec db-users psql -U your_postgres_user -d shield_db_name -c "SELECT email, blockchain_address, encrypted_private_key FROM users WHERE email = 'test.officer@shield.gov.in';"
```

If successful, you will see the user's email, their new public blockchain address (starting with `0x`), and a long encrypted string representing their secured private key.
