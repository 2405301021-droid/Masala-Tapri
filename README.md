# Masala Tapri

A full-stack website for a small chai shop. Visitors can read the story, browse a menu, and send a message through a contact form. The menu is served by a backend API and the messages are saved on the server.

**Author:** ARPIT
**Roll number:** 2405301021  
**Course:** AI for BBA (UG) Advanced

**Live frontend (Cloudflare):** https://shy-sound-bf35.2405301021.workers.dev

## Features
- Five responsive pages: Home, Menu, About, Contact and a custom 404 page
- Menu loaded from the backend (`GET /api/menu`) with category filters
- Contact form checked in the browser and again on the server, then stored by the backend
- Input validation, request-size limit, rate limit (5 messages per 10 minutes per IP) and protection against path traversal
- Private admin endpoint to read saved messages, protected by a token
- Automated backend tests (6 tests)

## Tech stack
| Part | Technology |
|------|-----------|
| Frontend | HTML, CSS, vanilla JavaScript |
| Backend | Node.js (built-in `http` module, no external packages) |
| Storage | JSON files in `backend/data/` |
| Hosting (frontend) | Cloudflare |

## Project structure
```
masala-tapri/
├── frontend/            # static site served by the backend
│   ├── index.html  menu.html  about.html  contact.html  404.html
│   ├── css/style.css
│   ├── js/main.js       # navigation, menu rendering, form submission
│   └── images/          # SVG artwork and favicon
├── backend/
│   ├── server.js        # HTTP server and API
│   ├── server.test.js   # automated tests
│   └── data/
│       ├── menu.json    # menu items
│       └── messages.json   # created automatically when the first message arrives
├── package.json
└── README.md
```

## How to run it
You need **Node.js 18 or newer** (check with `node --version`). There is nothing to install with npm.

```bash
git clone https://github.com/YOUR-USERNAME/masala-tapri.git
cd masala-tapri
npm start
```

Open http://localhost:3000 in your browser. Use another port with `PORT=4000 npm start` (macOS/Linux) or `set PORT=4000 && npm start` (Windows cmd).

### Run the tests
```bash
npm test
```

### Read saved messages (optional)
Start the server with a secret token, then call the admin endpoint:
```bash
ADMIN_TOKEN=mysecret npm start        # Windows cmd: set ADMIN_TOKEN=mysecret && npm start
curl -H "Authorization: Bearer mysecret" http://localhost:3000/api/messages
```
Without `ADMIN_TOKEN` the endpoint is disabled. Messages are also stored in `backend/data/messages.json`.

## API reference
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Returns `{ "status": "ok" }` |
| GET | `/api/menu` | Returns all menu categories and items |
| POST | `/api/contact` | Saves a message. Body: `name`, `email`, `topic`, `message`. Returns `201` or `400` with field errors |
| GET | `/api/messages` | Admin only. Requires `Authorization: Bearer <ADMIN_TOKEN>` |

Example:
```bash
curl -X POST http://localhost:3000/api/contact \
  -H "Content-Type: application/json" \
  -d '{"name":"Asha","email":"asha@example.com","topic":"Event booking","message":"Can you cater 30 people on Friday?"}'
```

## Notes
- The frontend also works as a plain static site (for example on Cloudflare). In that case the menu uses the content already in `menu.html`, and the contact form needs the backend running to save messages.
- Contact messages are stored in a file, which is enough for a small project. A real deployment would use a database.
