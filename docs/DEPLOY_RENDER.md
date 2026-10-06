# Deploy Mimir v4.6.0 to Render

1. Push this project to the existing GitHub repository.
2. Let the existing Render Blueprint/Web Service redeploy from the new commit.
3. Build Command: `npm install`.
4. Start Command: `npm start`.
5. Health Check Path: `/api/health`.
6. Keep `GEMINI_API_KEY` only in Render Environment Variables.
7. Verify the random `*.onrender.com` URL before changing DNS.
8. Follow the JD-only and CV smoke tests in `README.md` and `docs/JD_INTELLIGENCE_V4_6.md`.
9. Only after the smoke tests pass, add `mimir.co.in` under Render **Settings → Custom Domains** and apply the DNS values Render shows in GoDaddy.

Do not create a new GitHub repository or Render service for this update.
