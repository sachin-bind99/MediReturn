function Dashboard() {
  const stats = [
    {
      title: "Total Inventory",
      value: "₹0",
    },
    {
      title: "Return Due",
      value: "0",
    },
    {
      title: "Expiring Soon",
      value: "0",
    },
    {
      title: "Overdue",
      value: "0",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="flex items-center justify-between px-6 py-4">
          <h1 className="text-2xl font-bold text-blue-600">
            MediReturn
          </h1>

          <button className="rounded-lg border px-4 py-2 text-gray-700">
            Profile
          </button>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="min-h-[calc(100vh-73px)] w-56 border-r bg-white p-4">
          <nav className="space-y-2">
            <button className="w-full rounded-lg bg-blue-50 px-4 py-3 text-left font-medium text-blue-600">
              Dashboard
            </button>

            <button className="w-full rounded-lg px-4 py-3 text-left hover:bg-gray-100">
              Medicines
            </button>

            <button className="w-full rounded-lg px-4 py-3 text-left hover:bg-gray-100">
              Inventory
            </button>

            <button className="w-full rounded-lg px-4 py-3 text-left hover:bg-gray-100">
              Suppliers
            </button>

            <button className="w-full rounded-lg px-4 py-3 text-left hover:bg-gray-100">
              Returns
            </button>

            <button className="w-full rounded-lg px-4 py-3 text-left hover:bg-gray-100">
              Analytics
            </button>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          <h2 className="text-3xl font-bold text-gray-900">
            Dashboard
          </h2>

          <p className="mt-2 text-gray-600">
            Overview of your pharmacy inventory.
          </p>

          {/* Statistics */}
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat) => (
              <div
                key={stat.title}
                className="rounded-xl bg-white p-6 shadow-sm"
              >
                <p className="text-sm text-gray-500">
                  {stat.title}
                </p>

                <h3 className="mt-3 text-3xl font-bold text-gray-900">
                  {stat.value}
                </h3>
              </div>
            ))}
          </div>

          {/* Empty State */}
          <div className="mt-6 rounded-xl bg-white p-8 text-center shadow-sm">
            <h3 className="text-xl font-semibold text-gray-900">
              No inventory data yet
            </h3>

            <p className="mt-2 text-gray-500">
              Add medicines to start managing your pharmacy inventory.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

export default Dashboard;