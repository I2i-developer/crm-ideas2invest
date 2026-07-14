import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request) {
  let response = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        get(name) {
          return request.cookies.get(name)?.value
        },
        set(name, value, options) {
          response.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove(name, options) {
          response.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const protectedPrefixes = ['/admin', '/dashboard', '/tasks', '/operations', '/notifications', '/system-gate', '/register']

  if (protectedPrefixes.some((prefix) => pathname.startsWith(prefix)) && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && (pathname.startsWith('/admin') || pathname.startsWith('/operations') || pathname.startsWith('/system-gate') || pathname.startsWith('/register'))) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active, status')
      .eq('id', user.id)
      .maybeSingle()

    const isAdmin = profile?.role === 'admin'
    const isOperations = profile?.role === 'operations'
    const isInactive = profile?.is_active === false || profile?.status === 'Inactive'

    if (isInactive) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    const isOperationsAllowedClientPage =
      pathname.startsWith('/admin/clients') &&
      !pathname.includes('/edit')
    const isOperationsAllowedAdminPage =
      isOperationsAllowedClientPage ||
      pathname.startsWith('/admin/birthdays') ||
      pathname.startsWith('/admin/document-requirements') ||
      pathname.startsWith('/admin/calculators') ||
      pathname.startsWith('/admin/kyc-status') ||
      pathname.startsWith('/admin/risk-profiling') ||
      pathname.startsWith('/admin/insurance') ||
      pathname.startsWith('/admin/tasks') ||
      pathname.startsWith('/admin/sip-tracker') ||
      pathname.startsWith('/admin/forms-center') ||
      pathname.startsWith('/admin/company') ||
      pathname.startsWith('/admin/settings')

    if (pathname.startsWith('/admin') && !isAdmin && !(isOperations && isOperationsAllowedAdminPage)) {
      const targetPath = isOperations ? '/operations/dashboard' : '/login'
      return NextResponse.redirect(new URL(targetPath, request.url))
    }

    if (pathname.startsWith('/operations') && !isAdmin && !isOperations) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    if (pathname.startsWith('/system-gate') && !isAdmin) {
      const targetPath = isOperations ? '/operations/dashboard' : '/login'
      return NextResponse.redirect(new URL(targetPath, request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/admin/:path*', '/dashboard/:path*', '/tasks/:path*', '/operations/:path*', '/notifications/:path*', '/notifications', '/system-gate/:path*', '/register', '/login'],
}
