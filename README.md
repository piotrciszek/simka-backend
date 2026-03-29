# SimBasket — Backend

Node.js/Express REST API for SimBasket, a Fastbreak Basketball league management application.

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express 5
- **Language:** TypeScript
- **Database:** MySQL (mysql2)
- **Auth:** JWT + bcrypt
- **Other:** multer (file uploads), csv-parse, cheerio, iconv-lite, dotenv

## Project Structure

```
src/
├── config/         # Database connection
├── middleware/     # Auth middleware (JWT, role guard)
├── routes/         # API routes
│   ├── auth.ts     # Login, password change, activity log
│   ├── boxes.ts    # Box score parser (HTML files)
│   ├── csv.ts      # CSV upload and player database
│   ├── news.ts     # News/home feed
│   ├── tactics.ts  # Team tactics
│   ├── teams.ts    # Team management
│   └── users.ts    # User management
├── app.ts          # Express app setup
└── server.ts       # Entry point
uploads/
├── boxes/          # Box score HTML files (dev)
├── csv/            # CSV player database files (dev)
├── html/           # Static HTML files (standings, rosters, stats)
└── pbp/            # Play-by-play text files (dev)
└── .../            # other (dev)
```

## Getting Started

### Prerequisites

- Node.js 18+
- MySQL database

### Installation

1. Clone the repository:

```bash
git clone https://github.com/your-username/simbasket-backend.git
cd simbasket-backend
```

2. Install dependencies:

```bash
npm install
```

3. Create `.env` file in the root directory:

```
PORT=3000
DB_HOST=your_db_host
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=your_db_name
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=8h
CSV_DIR=uploads/csv
BOXES_DIR=uploads/boxes
PBP_DIR=uploads/pbp
NODE_ENV=development
```

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

4. Run in development mode:

```bash
npm run dev
```

5. Build for production:

```bash
npm run build
node dist/server.js
```

## Roles

| Role     | Permissions                                               |
| -------- | --------------------------------------------------------- |
| `admin`  | Full access — manage users, teams, CSV, all tactics       |
| `komisz` | Approve tactics, manage users (no delete), view all teams |
| `user`   | Own team tactics only                                     |

## TODO

- [ ] **Migracja typów auth** — zamienić `AuthRequest` na `AuthenticatedRequest` we wszystkich chronionych route'ach, żeby usunąć `req.user!` (wykrzykniki). `AuthenticatedRequest` jest już zdefiniowany w `middleware/auth.ts`.
- [ ] **Helper `canAccessTeam(user, ownerId)`** — ten sam blok sprawdzania właściciela drużyny powtarza się 3 razy w `tactics.ts` (linie GET/PUT draft/PUT submit). Wydzielić do osobnej funkcji.
- [ ] **Wydzielenie logiki parsowania CSV** — identyczny kod parsowania i zapisu graczy w `/upload` i `/load-file` w `csv.ts`.
- [ ] **Typy DB zamiast `any`** — stworzyć `src/types/db.ts` z interfejsami dla tabel (np. `UserRow`, `TeamRow`) i zastąpić `[rows]: any` w route'ach przez `pool.query<UserRow[]>(...)`.

## Environment Variables

| Variable         | Description                  | Dev default     |
| ---------------- | ---------------------------- | --------------- |
| `PORT`           | Server port                  | `3000`          |
| `DB_HOST`        | MySQL host                   | —               |
| `DB_USER`        | MySQL user                   | —               |
| `DB_PASSWORD`    | MySQL password               | —               |
| `DB_NAME`        | MySQL database name          | —               |
| `JWT_SECRET`     | JWT signing secret           | —               |
| `JWT_EXPIRES_IN` | JWT expiry                   | `8h`            |
| `CSV_DIR`        | Path to CSV files            | `uploads/csv`   |
| `BOXES_DIR`      | Path to box score HTML files | `uploads/boxes` |
| `PBP_DIR`        | Path to play-by-play files   | `uploads/pbp`   |
| `NODE_ENV`       | Environment                  | `development`   |
