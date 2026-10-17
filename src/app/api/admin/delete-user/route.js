import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAdmin } from '@/utils/admin';

export async function POST(request) {
    // SECURITY: this route uses the service-role key, so it must never run
    // for an unauthenticated or non-admin caller. Deleting accounts is
    // destructive, so it requires a super admin.
    let caller;
    try {
        caller = await validateAdmin('super_admin');
    } catch (authErr) {
        const forbidden = /Forbidden/i.test(authErr?.message || '');
        return NextResponse.json(
            { error: forbidden ? 'Forbidden' : 'Unauthorized' },
            { status: forbidden ? 403 : 401 }
        );
    }

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

        if (userId === caller.user.id) {
            return NextResponse.json({ error: 'You cannot delete your own admin account here.' }, { status: 400 });
        }

        // 1. Delete the user from Auth. 
        // This will automatically cascade to public role tables if set up with ON DELETE CASCADE.
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (deleteError) {
            console.error('Auth deletion error:', deleteError);
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        // 2. Explicitly cleanup role tables just in case cascade is not set up
        await supabaseAdmin.from('admin_users').delete().eq('id', userId);
        await supabaseAdmin.from('riders').delete().eq('user_id', userId);
        await supabaseAdmin.from('vendors').delete().eq('user_id', userId);

        return NextResponse.json({ success: true });

    } catch (err) {
        console.error('Server error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
