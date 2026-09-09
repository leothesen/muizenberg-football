// Deterministic timezone for every test run: the league lives in South Africa, and
// fixture scheduling maths is timezone-sensitive.
process.env.TZ = "Africa/Johannesburg";
