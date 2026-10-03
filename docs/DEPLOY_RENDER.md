# Deploy Mimir v4.3 to Render

1. Push this folder as the root of a fresh GitHub repository.
2. In Render: New > Web Service > connect the repository.
3. Runtime: Node.
4. Build command: `npm install`.
5. Start command: `npm start`.
6. Plan: Free.
7. Add environment variable `GEMINI_API_KEY` with a newly created key.
8. Deploy and verify `/api/health`.
9. Add custom domain `mimir.co.in` in Render Settings > Custom Domains.
10. Configure the DNS values Render shows in GoDaddy; then verify the domain in Render.
