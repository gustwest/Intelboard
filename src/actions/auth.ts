'use server';

import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import { db } from '@/lib/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const signupSchema = z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
});

export async function signup(prevState: string | undefined, formData: FormData) {
    const data = Object.fromEntries(formData.entries());

    const parsed = signupSchema.safeParse(data);
    if (!parsed.success) {
        return 'Invalid input.';
    }

    const { name, email, password } = parsed.data;

    // Check if user exists
    const existingUser = await db.select().from(users).where(eq(users.email, email));
    if (existingUser.length > 0) {
        return 'User already exists.';
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        await db.insert(users).values({
            name,
            email,
            password: hashedPassword,
            role: 'user', // Default
        });
    } catch (error) {
        return 'Failed to create user.';
    }

    // Auto login? Or redirect to login?
    // Let's redirect to login for simplicity, or we can try to signIn.
    // signIn might need to be called from a form action directly or careful redirection.
    // We'll redirect to login.
    return 'success';
}

export async function authenticate(
    prevState: string | undefined,
    formData: FormData,
) {
    try {
        await signIn('credentials', formData);
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return 'Invalid credentials.';
                default:
                    return 'Something went wrong.';
            }
        }
        throw error;
    }
}
