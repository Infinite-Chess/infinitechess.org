// src/controllers/passwordResetController.ts
import { Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import db from '../database/database'; // Adjust path if needed
import { sendPasswordResetEmail } from './sendMail';

// Consider moving SALT_ROUNDS to a config file or environment variable
const SALT_ROUNDS: number = 10;

interface MemberQueryResult {
    user_id: number;
}

async function handleForgotPasswordRequest(req: Request, res: Response): Promise<void> {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
        res.status(400).json({ message: 'Email is required and must be a string.' });
        return;
    }

    try {
        // 1. Find user by email (case-insensitive)
        const member = db.get<MemberQueryResult>('SELECT user_id FROM members WHERE email = ? COLLATE NOCASE', [email]);

        if (member) {
            const userId: number = member.user_id;

            // 2. Invalidate old tokens (Using database.run for DELETE)
            db.run(
                'DELETE FROM password_reset_tokens WHERE user_id = ?',
                [userId]
            );

            // 3. Generate plain token
            const plainToken: string = crypto.randomBytes(32).toString('hex');

            // 4. Hash the plain token
            const hashedTokenForDb: string = await bcrypt.hash(plainToken, SALT_ROUNDS);

            // 5. Set expiration (e.g., 1 hour from now in seconds)
            const expiresInSeconds: number = 3600;
            const expiresAt: number = Math.floor(Date.now() / 1000) + expiresInSeconds;

            // 6. Store new token in the database
            db.run(
                'INSERT INTO password_reset_tokens (user_id, hashed_token, expires_at) VALUES (?, ?, ?)',
                [userId, hashedTokenForDb, expiresAt]
            );

            // 7. Construct reset URL
            const appBaseUrl: string = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
            const resetUrl: string = `${appBaseUrl}/reset-password/${plainToken}`;

            // 8. Send email
            await sendPasswordResetEmail(email, resetUrl);
        }

        // ALWAYS return a generic success message to prevent email enumeration.
        res.status(200).json({
            message: 'If an account with that email exists, a password reset link has been sent.',
        });
        return;

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            message: 'An error occurred while processing your request. Please try again later.',
        });
        return;
    }
}

export { handleForgotPasswordRequest };