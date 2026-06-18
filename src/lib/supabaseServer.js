import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

export async function createClient(request) {
  const cookieStore = await cookies()
  const authorization = request?.headers?.get('authorization')

  if (authorization?.startsWith('Bearer ')) {
    const accessToken = authorization.replace('Bearer ', '')
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: {
            Authorization: authorization,
          },
        },
      }
    )

    const getUser = supabase.auth.getUser.bind(supabase.auth)
    supabase.auth.getUser = () => getUser(accessToken)

    return supabase
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value
        },
      },
    }
  )
}
