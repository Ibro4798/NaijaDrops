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
        const { userId } = await request.json();

        if (!userId) {
            return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
        }

        // 1. Delete the user from Auth. 
        // This will automatically cascade to public.profiles and other related tables 
        // IF you have set up the foreign key constraints with ON DELETE CASCADE.
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (deleteError) {
            console.error('Auth deletion error:', deleteError);
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        // 2. Explicitly cleanup Profile just in case cascade is not set up
        await supabaseAdmin.from('profiles').delete().eq('id', userId);

        return NextResponse.json({ success: true });

    } catch (err) {
        console.error('Server error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
