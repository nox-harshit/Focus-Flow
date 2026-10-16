# Focus Flow — GitHub Pages Edition

A browser-based Pomodoro focus timer with YouTube search, a compact YouTube player, and a Recently Played list. Search results are not saved to history unless you select one to play it. The app uses separate HTML, CSS, and JavaScript files and can be hosted on GitHub Pages.

## Files

- `index.html` — page structure
- `styles.css` — styling and responsive layout
- `app.js` — timer, settings, music search, playback, and browser-local history
- `.nojekyll` — tells GitHub Pages not to run Jekyll processing
- `404.html` — lightweight fallback page
- `LICENSE` — MIT license
- `.gitignore` — ignores local/editor/secret files

## Deploy to GitHub Pages

1. Create a new repository on GitHub.
2. Upload the files in this folder to the repository's root (not the ZIP file itself).
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch `main` and folder `/(root)`, then save.
6. Wait for the Pages deployment to finish. Your site URL will look like `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`.

## Enable YouTube search

GitHub Pages hosts static files only; it cannot run `server.js` or read a private `.env` file. This edition calls the YouTube Data API directly from the browser. Each browser user must enter their own API key in **Music player → YouTube API setup** and click **Save key**. The key is stored in that browser's local storage, not in this repository.

To create a key:

1. Open the Google Cloud Console and create/select a project.
2. Enable **YouTube Data API v3**.
3. Create an API key.
4. Restrict the key to **YouTube Data API v3** and add your deployed GitHub Pages site as an HTTP referrer. For a project site, allow a pattern such as `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/*`; also add `http://localhost:8000/*` if you test locally.
5. Paste the key into the app's **YouTube API setup** field and save it.

**Security note:** Browser API keys are visible to the browser that uses them. Use a referrer-restricted key and API restrictions, monitor quota usage, and never commit a private unrestricted key. If you need a truly private key, deploy a backend/API proxy on a serverless or hosting platform; GitHub Pages alone cannot keep it secret.

## Playback limitation

The app searches YouTube and plays selected results using YouTube's official embedded player. YouTube does not provide an official audio-only playback API, so the video player cannot be fully removed while continuing to play YouTube through its supported player. This project does not extract or conceal the YouTube video stream.

## Local preview

Because this is a static site, you can preview it with any static HTTP server. With Python installed, run this command from the project folder:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. Enter an API key whose referrer restrictions allow localhost if you want to test search locally.

## Privacy

Timer preferences, played-track history, volume, and the API key are stored in the current browser using local storage. Clearing the browser's site data clears these saved values.

