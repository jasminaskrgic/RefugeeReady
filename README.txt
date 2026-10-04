RefugeeReady East Africa — Cloudflare Pages version

This project is ready for Cloudflare Pages.

Important:
- Do not put your Gemini key in index.html.
- In Cloudflare, create the environment variable GEMINI_API_KEY.
- Optional: create GEMINI_MODEL to override the default gemini-2.5-flash.
- The backend endpoint is functions/api/review.js, which Cloudflare serves at /api/review.
- The old Netlify functions have been removed.
- The PRM scoring uses the updated 50-point concept-note rubric.

Recommended deployment:
1. Put these files in your existing GitHub RefugeeReady repository.
2. Create a Cloudflare Pages project connected to that repository.
3. Use no build command and set the output/root directory to the repository root.
4. Add GEMINI_API_KEY under project environment variables/secrets.
5. Deploy.
