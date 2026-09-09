# 9Th-Grade AI v1.0 Pre-Flight Checklist

## Day-1 Public Launch Preparation

### ✅ Environment & Configuration
- [ ] Verify all required environment variables are set:
  - `DATABASE_URL` (PostgreSQL connection string)
  - `AUTH_SECRET` (32-byte random base64 string for JWT signing)
  - `NEXT_PUBLIC_SITE_URL` (production domain)
  - `REDIS_URL` (optional but recommended for production rate limiting)
  - `ANTHROPIC_API_KEY` or `GROQ_API_KEY` (for AI features)
  - `SMTP_*` or `MAIL_*` variables (for email functionality)
  - `ALLOWED_ORIGINS` (comma-separated list of allowed CORS origins)
- [ ] Confirm `.env.local` is NOT committed to git (should be in `.gitignore`)
- [ ] Validate Node.js version (>=18.x) and package manager compatibility

### ✅ Database & Migrations
- [ ] Run `prisma db push` to apply latest schema changes
- [ ] Execute `prisma db seed` to populate initial data
- [ ] Verify database connection health via `/api/health` endpoint
- [ ] Check for any missing indexes in database schema
- [ ] Confirm backup strategy is configured for production database

### ✅ Security Hardening
- [ ] Ensure `server-only` imports are properly used in backend files
- [ ] Verify all API routes use `assertSameOrigin` middleware
- [ ] Confirm CORS headers are properly restricted in production
- [ ] Validate Content Security Policy headers are implemented
- [ ] Check that sensitive data is redacted in logs (passwords, tokens)
- [ ] Verify rate limiting is enforced on auth endpoints
- [ ] Confirm password hashing uses bcrypt with cost factor 10
- [ ] Ensure JWT tokens have proper expiration (7 days) and versioning
- [ ] Validate input validation is applied to all API endpoints
- [ ] Check that error messages don't leak sensitive information

### ✅ Authentication & Authorization
- [ ] Test user registration flow (email verification, password strength)
- [ ] Test login flow (including rate limiting and lockout mechanisms)
- [ ] Test password reset flow (token validation, expiration)
- [ ] Test Google OAuth flow (if enabled)
- [ ] Verify session management (concurrent limits, token versioning)
- [ ] Test protected routes return 401 for unauthenticated requests
- [ ] Verify admin role-based access controls work correctly
- [ ] Test "logout everywhere" functionality (token version bump)

### ✅ API Endpoints
- [ ] Test all critical API endpoints return correct status codes
- [ ] Validate AI endpoints (/api/ai/solver, /api/ai/tutor) work with actual API keys
- [ ] Test exam generation and submission flows
- [ ] Verify question bank filtering and search functionality
- [ ] Check daily quiz participation tracking
- [ ] Validate bookmarking and progress tracking
- [ ] Confirm webhook endpoints (if any) are secured
- [ ] Test health check endpoint returns proper status

### ✅ Frontend & UX
- [ ] Verify hydration matches (no console warnings in dev)
- [ ] Test responsive design on mobile, tablet, and desktop
- [ ] Confirm loading states and skeletons are shown appropriately
- [ ] Test error boundaries catch and display errors gracefully
- [ ] Verify dark/light theme switching works in dashboard
- [ ] Test internationalization (English/Bengali) switching
- [ ] Confirm form validation works client-side and server-side
- [ ] Test accessibility features (keyboard navigation, ARIA labels)
- [ ] Verify performance metrics meet budgets (LCP < 2.5s, FID < 100ms)
- [ ] Test offline capabilities (if implemented)

### ✅ Performance & Optimization
- [ ] Run `next build` and verify no compilation errors
- [ ] Check bundle analyzer output for oversized dependencies
- [ ] Verify caching is working for frequently accessed data
- [ ] Test database query performance (watch for N+1 queries)
- [ ] Confirm static assets are properly optimized and compressed
- [ ] Verify image optimization is working (if using next/image)
- [ ] Test AI streaming responses don't timeout
- [ ] Validate graceful degradation when AI services are unavailable

### ✅ Observability & Monitoring
- [ ] Verify structured logging is working (JSON format in prod)
- [ ] Test error tracking integration (Sentry) is configured
- [ ] Confirm health check endpoint provides detailed status
- [ ] Verify performance monitoring is enabled
- [ ] Test alerting for critical metrics (error rates, latency)
- [ ] Confirm log retention and rotation policies
- [ ] Verify metrics collection for business KPIs

### ✅ Final Validation
- [ ] Run full test suite: `npm run test`
- [ ] Execute type checking: `npm run typecheck`
- [ ] Run linting: `npm run lint`
- [ ] Perform end-to-end testing of critical user journeys:
  - User registration → email verification → login → onboarding
  - Browse question bank → attempt practice questions → review results
  - Generate custom exam → submit exam → view results and explanations
  - Use AI tutor → ask follow-up questions → get personalized help
  - Track progress → view analytics → adjust study plan
- [ ] Test with production-like data volume (seed additional test data if needed)
- [ ] Verify deployment process works in staging environment
- [ ] Prepare rollback procedure in case of issues
- [ ] Prepare announcement/communication plan for launch day

### 🚀 Launch Day
- [ ] Verify monitoring dashboards are active and visible
- [ ] Have on-call engineer available for first 24 hours
- [ ] Prepare status page or communication channel for users
- [ ] Monitor error rates and performance metrics closely
- [ ] Be ready to scale resources if traffic exceeds expectations
- [ ] Document any issues and prepare patches for v1.0.1

## Post-Launch
- [ ] Monitor user feedback and bug reports
- [ ] Track key metrics (signups, activation, retention)
- [ ] Plan first iteration based on real-world usage data
- [ ] Schedule performance optimization work
- [ ] Plan security audit for post-launch