import { createServer } from "node:http";
import { URL } from "node:url";

// In-memory database

let users = [
  {
    id: 1,
    name: "Alice",
    role: "admin"
  },
  {
    id: 2,
    name: "Bob",
    role: "user"
  },
  {
    id: 3,
    name: "Charlie",
    role: "user"
  }
];

let nextId = 4;

// Custom error class

class AppError extends Error {
  constructor(statusCode, message) {
    super(message);

    this.statusCode = statusCode;
  }
}

// Send JSON response

function sendJSON(res, statusCode, data) {
  res.statusCode = statusCode;

  res.setHeader(
    "Content-Type",
    "application/json"
  );

  res.end(
    JSON.stringify(data)
  );
}

// Parse JSON request body

function parseBody(req) {
  return new Promise((resolve, reject) => {

    let body = "";

    req.on("data", chunk => {
      body += chunk.toString();

      if (body.length > 1_000_000) {
        reject(
          new AppError(
            413,
            "Request body too large"
          )
        );

        req.destroy();
      }
    });

    req.on("end", () => {

      // No body
      if (!body) {
        resolve({});
        return;
      }

      try {
        const parsed = JSON.parse(body);

        resolve(parsed);
      } catch {
        reject(
          new AppError(
            400,
            "Invalid JSON"
          )
        );
      }
    });

    req.on("error", () => {
      reject(
        new AppError(
          400,
          "Error reading request body"
        )
      );
    });
  });
}

// Route matching

function matchUserIdRoute(pathname) {

  const match = pathname.match(
    /^\/users\/(\d+)$/
  );

  if (!match) {
    return null;
  }

  return Number(match[1]);
}

// Request handler

async function handleRequest(req, res) {

  const url = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  );

  const pathname = url.pathname;
  const method = req.method;

  if (
    method === "GET" &&
    pathname === "/users"
  ) {

    const role = url.searchParams.get("role");

    let result = users;

    if (role) {
      result = users.filter(
        user => user.role === role
      );
    }

    sendJSON(
      res,
      200,
      result
    );

    return;
  }

  // GET /users/:id

  if (
    method === "GET" &&
    pathname.startsWith("/users/")
  ) {

    const id = matchUserIdRoute(pathname);

    if (id === null) {
      throw new AppError(
        400,
        "Invalid user ID"
      );
    }

    const user = users.find(
      user => user.id === id
    );

    if (!user) {
      throw new AppError(
        404,
        "User not found"
      );
    }

    sendJSON(
      res,
      200,
      user
    );

    return;
  }

  // POST /users

  if (
    method === "POST" &&
    pathname === "/users"
  ) {

    // Check Content-Type
    const contentType =
      req.headers["content-type"];

    if (
      !contentType ||
      !contentType.includes("application/json")
    ) {
      throw new AppError(
        415,
        "Content-Type must be application/json"
      );
    }

    const body = await parseBody(req);

    // Validate body
    if (
      typeof body.name !== "string" ||
      body.name.trim() === ""
    ) {
      throw new AppError(
        400,
        "name is required"
      );
    }

    if (
      typeof body.role !== "string" ||
      body.role.trim() === ""
    ) {
      throw new AppError(
        400,
        "role is required"
      );
    }

    const user = {
      id: nextId++,
      name: body.name.trim(),
      role: body.role.trim()
    };

    users.push(user);

    sendJSON(
      res,
      201,
      user
    );

    return;
  }

  // DELETE /users/:id

  if (
    method === "DELETE" &&
    pathname.startsWith("/users/")
  ) {

    const id = matchUserIdRoute(pathname);

    if (id === null) {
      throw new AppError(
        400,
        "Invalid user ID"
      );
    }

    const index = users.findIndex(
      user => user.id === id
    );

    if (index === -1) {
      throw new AppError(
        404,
        "User not found"
      );
    }

    const deletedUser =
      users.splice(index, 1)[0];

    sendJSON(
      res,
      200,
      {
        message: "User deleted",
        user: deletedUser
      }
    );

    return;
  }

  // Unknown route

  throw new AppError(
    404,
    "Route not found"
  );
}

// Central error handling

async function requestListener(req, res) {

  try {

    await handleRequest(req, res);

  } catch (error) {

    console.error(error);

    if (res.headersSent) {
      res.end();
      return;
    }

    if (error instanceof AppError) {

      sendJSON(
        res,
        error.statusCode,
        {
          error: error.message
        }
      );

      return;
    }
    sendJSON(
      res,
      500,
      {
        error: "Internal server error"
      }
    );
  }
}

// Create server

const server = createServer(
  requestListener
);

// Start server

const PORT = 3000;

server.listen(
  PORT,
  () => {
    console.log(
      `Server running at http://localhost:${PORT}`
    );
  }
);
