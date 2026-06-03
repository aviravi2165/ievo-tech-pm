import ModulePlaceholder from '../shared/ModulePlaceholder';

export default function ProjectManagementModule() {
  return (
    <ModulePlaceholder
      title="Project Management"
      description="Manage projects, tasks, Gantt views, and team assignments. This module will plug into the center workspace when the backend is ready."
      features={[
        'Project & work-order boards',
        'Task assignment & dependencies',
        'Milestone tracking',
        'Document attachments per project',
      ]}
    />
  );
}
