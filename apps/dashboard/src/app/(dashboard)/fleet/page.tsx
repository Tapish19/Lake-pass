import FleetList    from '@/components/fleet/FleetList';
import AddBoatButton from '@/components/fleet/AddBoatButton';
import CsvImport    from '@/components/fleet/CsvImport';

export default function FleetPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fleet</h1>
          <p className="text-gray-500">Manage your boats, photos, and availability</p>
        </div>
        <div className="flex gap-2">
          <CsvImport />
          <AddBoatButton />
        </div>
      </div>
      <FleetList />
    </div>
  );
}
