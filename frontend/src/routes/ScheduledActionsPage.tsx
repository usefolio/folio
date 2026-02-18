import { ScheduledActionsList } from "@/components/scheduledActions/scheduledActionsList";

const ScheduledActions: React.FC = () => {
  return (
    <div className="h-full overflow-auto bg-gray-50 p-6 scrollbar-thin">
      <div className="mx-auto">
        <div className="p-4">
          <ScheduledActionsList />
        </div>
      </div>
    </div>
  );
};
export default ScheduledActions;
