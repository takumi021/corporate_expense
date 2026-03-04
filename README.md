# Corporate Expense Tracking (Material 3 Expressive Web App)

I built this project as a role-based corporate expense tracking web app with a clean Material 3 expressive UI.

The platform has 3 user types:
- `employee` (customer/employee) submits expenses for approval
- `manager` reviews department expenses and approves/rejects
- `admin` manages users (add/delete employees, managers, and admins)

## Tech Stack
- Node.js + Express
- EJS templates
- PostgreSQL
- Multer (proof upload)
- Express Session
- Bcrypt password hashing

## Features Implemented
- Role-based login and separate dashboards after login
- Email/password validation during login:
  - valid email format required
  - password minimum 6 characters and must include at least one letter
- Employee expense submission flow with required fields:
  - Reason for expense
  - Date
  - Where
  - Paid By? (`Company` or `Employee`)
  - Proof of payment (PDF/JPG/PNG)
- Manager review flow:
  - sees recent expenses in their department
  - can approve or reject
  - approved status displays as: `Approved, sent for Disbursement.`
- Admin user management:
  - add users (employee/manager/admin)
  - delete users
  - assign employee to manager and department

## Project Structure
```text
.
├── db
│   ├── schema.sql
│   └── seed.sql
├── public
│   └── css/styles.css
├── src
│   ├── middleware/auth.js
│   ├── utils/flash.js
│   ├── utils/validators.js
│   ├── db.js
│   └── server.js
├── views
│   ├── admin
│   ├── employee
│   ├── manager
│   └── partials
└── uploads
```

## PostgreSQL Setup

### 1) Install PostgreSQL

Windows:
1. Download from: `https://www.postgresql.org/download/windows/`
2. Install with pgAdmin and command-line tools.
3. Ensure `psql` is available in PATH.

macOS (Homebrew):
```bash
brew install postgresql
brew services start postgresql
```

Ubuntu/Debian:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2) Create database and user (SQL commands to feed)

Open `psql` as a superuser and run:

```sql
CREATE DATABASE corporate_expense;

-- Optional dedicated app user:
CREATE USER corp_app WITH ENCRYPTED PASSWORD 'StrongPassword123';
GRANT ALL PRIVILEGES ON DATABASE corporate_expense TO corp_app;
```

Then connect to the new DB:

```sql
\c corporate_expense

-- Needed for crypt() in seed.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

### 3) Load schema + seed data

From repo root:

```bash
psql -U postgres -d corporate_expense -f db/schema.sql
psql -U postgres -d corporate_expense -f db/seed.sql
```

If using dedicated user:

```bash
psql -U corp_app -d corporate_expense -f db/schema.sql
psql -U corp_app -d corporate_expense -f db/seed.sql
```

Seed login accounts:
- admin: `admin@corp.com` / `Passw0rd`
- manager: `manager@corp.com` / `Passw0rd`
- employee: `employee@corp.com` / `Passw0rd`

## Application Setup

### 1) Install dependencies
```bash
npm install
```

### 2) Configure environment
Copy `.env.example` to `.env` and set values:

```env
PORT=3000
SESSION_SECRET=replace_with_a_secure_value
PGHOST=localhost
PGPORT=5432
PGDATABASE=corporate_expense
PGUSER=postgres
PGPASSWORD=postgres
```

### 3) Run app
```bash
npm run dev
```

Open:
`http://localhost:3000`

## Important Notes
- Uploads are saved in `uploads/`.
- Max proof upload size is 5MB.
- Allowed proof file types: PDF, JPG, PNG.
- If an employee is missing manager/department assignment, expense submission is blocked until admin fixes assignment.

## How Approval Status Works
- Initial submit: `pending`
- Manager approve: `approved_disbursement` (shown as `Approved, sent for Disbursement.`)
- Manager reject: `rejected`

## What I would add next (optional)
- Department CRUD for admin
- Expense filters (date/amount/status)
- Export to CSV
- Audit log for admin actions
- Stronger production session store (Redis/PostgreSQL)
