export function PickupProgress({ status }) {
  const stages = [
    ['awaiting_volunteer', 'Awaiting claim'],
    ['assigned', 'Claimed'],
    ['en_route_to_pickup', 'En route'],
    ['picked_up', 'Donor handover'],
    ['delivered', 'NGO receipt'],
  ];
  const current = stages.findIndex(([value]) => value === status);
  if (current < 0)
    return (
      <p className="community-custody-note">
        Transportation cancelled. Review the reservation for its current food
        status.
      </p>
    );
  return (
    <ol className="community-progress" aria-label="Pickup progress">
      {stages.map(([value, label], index) => (
        <li
          key={value}
          className={index <= current ? 'is-reached' : ''}
          aria-current={status === value ? 'step' : undefined}
        >
          <span>{String(index + 1).padStart(2, '0')}</span>
          {label}
        </li>
      ))}
    </ol>
  );
}
