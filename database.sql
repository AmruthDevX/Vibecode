-- Create the chat messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL
);

-- Turn on row level security, but allow all operations for anon (assuming a fully public integration for demo/studio purposes).
-- WARNING: If this is used in production, configure row-level security (RLS) properly to prevent unauthorized access.
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read and write (this allows the vanilla JS client to insert and select messages using the anon key)
CREATE POLICY "Enable all operations for anon users" ON public.chat_messages
    AS PERMISSIVE FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);
