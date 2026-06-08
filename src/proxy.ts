import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const freelancerOnly = ["/freelancer"];
const companyOnly = ["/company"];
const authenticatedOnly = ["/interviews"];

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const session = request.auth;

  if (
    (freelancerOnly.some((path) => pathname.startsWith(path)) ||
      companyOnly.some((path) => pathname.startsWith(path)) ||
      authenticatedOnly.some((path) => pathname.startsWith(path))) &&
    !session?.user
  ) {
    const login = new URL("/login", request.url);
    login.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  if (freelancerOnly.some((path) => pathname.startsWith(path)) && session?.user.role !== "freelancer") {
    return NextResponse.redirect(new URL("/company", request.url));
  }

  if (companyOnly.some((path) => pathname.startsWith(path)) && session?.user.role !== "company_user") {
    return NextResponse.redirect(new URL("/freelancer", request.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/freelancer/:path*", "/company/:path*", "/interviews/:path*"],
};
