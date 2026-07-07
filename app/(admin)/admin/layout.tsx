import AdminSidebar from "@/components/admin/AdminSidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-[#060606] text-white">
      <AdminSidebar />
      <div className="flex-1 overflow-y-auto p-8 max-w-7xl mx-auto">
        {children}
      </div>
    </div>
  );
}
