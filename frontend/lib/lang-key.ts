// Plain (non-"use client") module so server components can interpolate the
// value into inline pre-paint scripts. Importing it from a client module
// would yield a client-reference proxy on the server instead of the string.
export const LANGUAGE_KEY = "9th-grade-ai-lang";
