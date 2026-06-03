import ModulePlaceholder from '../shared/ModulePlaceholder';

export default function SchedulingModule() {
  return (
    <ModulePlaceholder
      title="Scheduling"
      description="Plan production slots, deliveries, and resource allocation across the Udaipur facility and sites."
      features={[
        'Production calendar',
        'Machine & crew scheduling',
        'Delivery & installation windows',
        'Conflict alerts',
      ]}
    />
  );
}
