const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");
const { query } = require("./db");
const { requireAuth, requireRole } = require("./middleware/auth");
const { isValidEmail, isValidPassword, normalizePaidBy } = require("./utils/validators");
const { setFlash } = require("./utils/flash");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const uploadsDir = path.join(__dirname, "..", "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const safeExt = path.extname(file.originalname).toLowerCase();
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
      cb(null, unique);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png"];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(new Error("Proof must be PDF, JPG, or PNG."));
    }
    return cb(null, true);
  },
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-me-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 },
  })
);
app.use("/public", express.static(path.join(__dirname, "..", "public")));
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

function redirectByRole(role) {
  if (role === "employee") return "/employee/dashboard";
  if (role === "manager") return "/manager/dashboard";
  if (role === "admin") return "/admin/dashboard";
  return "/login";
}

function statusLabel(status) {
  if (status === "approved_disbursement") return "Approved, sent for Disbursement.";
  if (status === "rejected") return "Rejected";
  return "Pending Manager Approval";
}

app.get("/", (req, res) => {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  return res.redirect(redirectByRole(req.session.user.role));
});

app.get("/login", (req, res) => {
  if (req.session.user) {
    return res.redirect(redirectByRole(req.session.user.role));
  }
  return res.render("login", { title: "Corporate Expense Tracker | Login" });
});

app.post("/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");

  if (!isValidEmail(email)) {
    setFlash(req, "error", "Please enter a valid email address.");
    return res.redirect("/login");
  }

  if (!isValidPassword(password)) {
    setFlash(req, "error", "Password must have at least 6 characters and include a letter.");
    return res.redirect("/login");
  }

  try {
    const userResult = await query(
      `
      SELECT u.id, u.full_name, u.email, u.password_hash, u.role, u.department_id, u.manager_id, u.active,
             d.name AS department_name
      FROM users u
      LEFT JOIN departments d ON d.id = u.department_id
      WHERE LOWER(u.email) = $1
      LIMIT 1
      `,
      [email]
    );

    const user = userResult.rows[0];
    if (!user || !user.active) {
      setFlash(req, "error", "Invalid login credentials.");
      return res.redirect("/login");
    }

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) {
      setFlash(req, "error", "Invalid login credentials.");
      return res.redirect("/login");
    }

    req.session.user = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      departmentId: user.department_id,
      departmentName: user.department_name,
      managerId: user.manager_id,
    };

    return res.redirect(redirectByRole(user.role));
  } catch (error) {
    return res.status(500).render("error", {
      title: "Login Error",
      message: error.message,
    });
  }
});

app.post("/logout", requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login");
  });
});

app.get("/employee/dashboard", requireRole("employee"), async (req, res) => {
  try {
    const expensesResult = await query(
      `
      SELECT e.id, e.reason, e.expense_date, e.location, e.amount, e.paid_by, e.status,
             e.proof_file, e.created_at, e.manager_comment
      FROM expenses e
      WHERE e.employee_id = $1
      ORDER BY e.created_at DESC
      LIMIT 30
      `,
      [req.session.user.id]
    );

    const expenses = expensesResult.rows.map((item) => ({
      ...item,
      statusLabel: statusLabel(item.status),
    }));

    return res.render("employee/dashboard", {
      title: "Employee Dashboard",
      expenses,
    });
  } catch (error) {
    return res.status(500).render("error", {
      title: "Employee Dashboard Error",
      message: error.message,
    });
  }
});

app.post("/employee/expenses", requireRole("employee"), (req, res) => {
  upload.single("proof_file")(req, res, async (uploadError) => {
    if (uploadError) {
      setFlash(req, "error", uploadError.message);
      return res.redirect("/employee/dashboard");
    }

    const reason = String(req.body.reason || "").trim();
    const expenseDate = String(req.body.expense_date || "").trim();
    const location = String(req.body.location || "").trim();
    const amount = Number(req.body.amount || 0);
    const paidBy = normalizePaidBy(req.body.paid_by);

    if (!reason || !expenseDate || !location || !paidBy || amount <= 0) {
      setFlash(req, "error", "All fields are required and amount must be greater than 0.");
      return res.redirect("/employee/dashboard");
    }

    if (!req.file) {
      setFlash(req, "error", "Proof of payment file is required.");
      return res.redirect("/employee/dashboard");
    }

    try {
      const employeeResult = await query(
        `
        SELECT u.department_id, u.manager_id
        FROM users u
        WHERE u.id = $1
        `,
        [req.session.user.id]
      );

      const employee = employeeResult.rows[0];
      if (!employee || !employee.department_id || !employee.manager_id) {
        setFlash(req, "error", "Your account is missing manager or department assignment. Contact admin.");
        return res.redirect("/employee/dashboard");
      }

      await query(
        `
        INSERT INTO expenses
        (employee_id, department_id, manager_id, reason, expense_date, location, amount, paid_by, proof_file, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
        `,
        [
          req.session.user.id,
          employee.department_id,
          employee.manager_id,
          reason,
          expenseDate,
          location,
          amount,
          paidBy,
          `/uploads/${req.file.filename}`,
        ]
      );

      setFlash(req, "success", "Expense submitted successfully and sent for manager review.");
      return res.redirect("/employee/dashboard");
    } catch (error) {
      setFlash(req, "error", `Could not submit expense: ${error.message}`);
      return res.redirect("/employee/dashboard");
    }
  });
});

app.get("/manager/dashboard", requireRole("manager"), async (req, res) => {
  try {
    const expensesResult = await query(
      `
      SELECT e.id, e.reason, e.expense_date, e.location, e.amount, e.paid_by, e.status,
             e.proof_file, e.created_at, e.manager_comment, u.full_name AS employee_name
      FROM expenses e
      INNER JOIN users u ON u.id = e.employee_id
      WHERE e.department_id = $1
      ORDER BY e.created_at DESC
      LIMIT 60
      `,
      [req.session.user.departmentId]
    );

    const expenses = expensesResult.rows.map((item) => ({
      ...item,
      statusLabel: statusLabel(item.status),
    }));

    return res.render("manager/dashboard", {
      title: "Manager Dashboard",
      expenses,
    });
  } catch (error) {
    return res.status(500).render("error", {
      title: "Manager Dashboard Error",
      message: error.message,
    });
  }
});

app.post("/manager/expenses/:id/review", requireRole("manager"), async (req, res) => {
  const expenseId = Number(req.params.id);
  const decision = req.body.decision;
  const managerComment = String(req.body.manager_comment || "").trim();
  const nextStatus = decision === "approve" ? "approved_disbursement" : "rejected";

  if (!expenseId || !["approve", "reject"].includes(decision)) {
    setFlash(req, "error", "Invalid review request.");
    return res.redirect("/manager/dashboard");
  }

  try {
    const updateResult = await query(
      `
      UPDATE expenses
      SET status = $1,
          manager_comment = $2,
          reviewed_at = NOW(),
          updated_at = NOW()
      WHERE id = $3
        AND department_id = $4
        AND status = 'pending'
      RETURNING id
      `,
      [nextStatus, managerComment || null, expenseId, req.session.user.departmentId]
    );

    if (updateResult.rowCount === 0) {
      setFlash(req, "error", "This expense is unavailable for review.");
      return res.redirect("/manager/dashboard");
    }

    setFlash(
      req,
      "success",
      nextStatus === "approved_disbursement"
        ? "Expense approved. Approved, sent for Disbursement."
        : "Expense rejected."
    );
    return res.redirect("/manager/dashboard");
  } catch (error) {
    setFlash(req, "error", `Review failed: ${error.message}`);
    return res.redirect("/manager/dashboard");
  }
});

app.get("/admin/dashboard", requireRole("admin"), async (_req, res) => {
  try {
    const [usersStats, expensesStats, departmentsStats] = await Promise.all([
      query(
        `
        SELECT
          COUNT(*) FILTER (WHERE role = 'employee' AND active = TRUE) AS employees,
          COUNT(*) FILTER (WHERE role = 'manager' AND active = TRUE) AS managers,
          COUNT(*) FILTER (WHERE role = 'admin' AND active = TRUE) AS admins
        FROM users
        `
      ),
      query(
        `
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'approved_disbursement') AS approved,
          COUNT(*) FILTER (WHERE status = 'rejected') AS rejected
        FROM expenses
        `
      ),
      query(`SELECT COUNT(*) AS total_departments FROM departments`),
    ]);

    return res.render("admin/dashboard", {
      title: "Admin Dashboard",
      stats: {
        employees: usersStats.rows[0].employees,
        managers: usersStats.rows[0].managers,
        admins: usersStats.rows[0].admins,
        pending: expensesStats.rows[0].pending,
        approved: expensesStats.rows[0].approved,
        rejected: expensesStats.rows[0].rejected,
        departments: departmentsStats.rows[0].total_departments,
      },
    });
  } catch (error) {
    return res.status(500).render("error", {
      title: "Admin Dashboard Error",
      message: error.message,
    });
  }
});

app.get("/admin/users", requireRole("admin"), async (_req, res) => {
  try {
    const [usersResult, departmentsResult, managersResult] = await Promise.all([
      query(
        `
        SELECT u.id, u.full_name, u.email, u.role, u.active, u.created_at,
               d.name AS department_name,
               m.full_name AS manager_name
        FROM users u
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN users m ON m.id = u.manager_id
        ORDER BY u.role, u.created_at DESC
        `
      ),
      query(`SELECT id, name FROM departments ORDER BY name`),
      query(
        `
        SELECT id, full_name, department_id
        FROM users
        WHERE role = 'manager' AND active = TRUE
        ORDER BY full_name
        `
      ),
    ]);

    return res.render("admin/users", {
      title: "Admin | User Management",
      users: usersResult.rows,
      departments: departmentsResult.rows,
      managers: managersResult.rows,
    });
  } catch (error) {
    return res.status(500).render("error", {
      title: "User Management Error",
      message: error.message,
    });
  }
});

app.post("/admin/users", requireRole("admin"), async (req, res) => {
  const fullName = String(req.body.full_name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const role = String(req.body.role || "").trim();
  const departmentId = req.body.department_id ? Number(req.body.department_id) : null;
  const managerId = req.body.manager_id ? Number(req.body.manager_id) : null;

  if (!fullName || !isValidEmail(email) || !isValidPassword(password)) {
    setFlash(
      req,
      "error",
      "Enter valid user details: valid email and password with at least 6 characters including a letter."
    );
    return res.redirect("/admin/users");
  }

  if (!["employee", "manager", "admin"].includes(role)) {
    setFlash(req, "error", "Role must be employee, manager, or admin.");
    return res.redirect("/admin/users");
  }

  if (role !== "admin" && !departmentId) {
    setFlash(req, "error", "Department is required for employees and managers.");
    return res.redirect("/admin/users");
  }

  if (role === "employee" && !managerId) {
    setFlash(req, "error", "Manager assignment is required for employees.");
    return res.redirect("/admin/users");
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await query(
      `
      INSERT INTO users (full_name, email, password_hash, role, department_id, manager_id, active)
      VALUES ($1, $2, $3, $4, $5, $6, TRUE)
      `,
      [fullName, email, passwordHash, role, departmentId, role === "employee" ? managerId : null]
    );

    setFlash(req, "success", `${role} account created successfully.`);
    return res.redirect("/admin/users");
  } catch (error) {
    if (error.code === "23505") {
      setFlash(req, "error", "A user with this email already exists.");
      return res.redirect("/admin/users");
    }
    setFlash(req, "error", `Could not create user: ${error.message}`);
    return res.redirect("/admin/users");
  }
});

app.post("/admin/users/:id/delete", requireRole("admin"), async (req, res) => {
  const targetId = Number(req.params.id);

  if (!targetId) {
    setFlash(req, "error", "Invalid user id.");
    return res.redirect("/admin/users");
  }

  if (targetId === req.session.user.id) {
    setFlash(req, "error", "You cannot delete your own account.");
    return res.redirect("/admin/users");
  }

  try {
    const deleteResult = await query(`DELETE FROM users WHERE id = $1 RETURNING id`, [targetId]);
    if (deleteResult.rowCount === 0) {
      setFlash(req, "error", "User not found.");
      return res.redirect("/admin/users");
    }

    setFlash(req, "success", "User deleted successfully.");
    return res.redirect("/admin/users");
  } catch (error) {
    setFlash(req, "error", `Could not delete user: ${error.message}`);
    return res.redirect("/admin/users");
  }
});

app.use((req, res) => {
  return res.status(404).render("error", {
    title: "Not Found",
    message: `No route found for ${req.originalUrl}.`,
  });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running at http://localhost:${PORT}`);
});
