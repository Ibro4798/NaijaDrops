import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
    // Requires SUPABASE_SERVICE_ROLE_KEY — this runs on the server only.
    const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
    );

    try {
        const { fullName, email, phone } = await request.json();

        if (!fullName || !email) {
            return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 });
        }

        // Step 1: Create the user account using the admin API.
        // We do NOT set a password — Supabase will send a "magic link" style invite.
        const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email,
            email_confirm: true,    // Auto-confirm so the invite link goes straight to password reset
            user_metadata: {
                full_name: fullName,
                phone: phone || null,
                role: 'rider'
            },
        });

        if (createError) {
            return NextResponse.json({ error: createError.message }, { status: 500 });
        }

        const userId = createData.user.id;

        // Step 2: Insert into public.users then public.riders
        await supabaseAdmin.from('users').upsert({
            id: userId,
            email,
            role: 'rider',
            full_name: fullName,
            name: fullName,
        }, { onConflict: 'id' });

        await supabaseAdmin.from('riders').upsert({
            user_id: userId,
            full_name: fullName,
            phone: phone || null,
            status: 'pending',
        }, { onConflict: 'user_id' });

        // Step 3: Generate a one-time password reset link that the driver uses to set their own password
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email,
            options: {
                redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://naijadrops.tech'}/rider/onboarding`,
            },
        });

        if (linkError) {
            // User was created, but link generation failed — return partial success
            return NextResponse.json({ 
                success: true, 
                userId,
                inviteLink: null,
                warning: 'Rider created but invite link generation failed. You can send a password reset email manually.' 
            });
        }

        return NextResponse.json({
            success: true,
            userId,
            inviteLink: linkData.properties?.action_link,
        });

    } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
