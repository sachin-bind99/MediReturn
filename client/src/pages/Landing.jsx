import { Link } from "react-router-dom";

function Landing() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <h1 className="text-2xl font-bold text-blue-600">
            MediReturn
          </h1>

          <div className="flex items-center gap-4">
            <Link
              to="/login"
              className="text-gray-700 hover:text-blue-600"
            >
              Login
            </Link>

            <Link
              to="/register"
              className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
            >
              Signup
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="mx-auto flex min-h-[80vh] max-w-6xl items-center justify-center px-6">
        <div className="max-w-3xl text-center">
          <h2 className="text-4xl font-bold text-gray-900 md:text-6xl">
            Smart Pharmacy Inventory Management
          </h2>

          <p className="mt-6 text-lg text-gray-600">
            Track expiry. Manage returns. Reduce loss.
          </p>

          <Link
            to="/register"
            className="mt-8 inline-block rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Get Started
          </Link>
        </div>
      </main>
    </div>
  );
}

export default Landing;