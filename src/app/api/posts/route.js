import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function createPostsClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase environment variables are not configured");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET() {
  const supabase = createPostsClient()

  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data)
}

export async function POST(req) {
  const supabase = createPostsClient()
  const body = await req.json()
  const { title } = body

  const { data, error } = await supabase
    .from('posts')
    .insert([{ title }])
    .select()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data[0])
}
