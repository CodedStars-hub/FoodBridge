import { useState } from 'react';
import { Leaf } from 'lucide-react';
export default function DonationPhoto({ donation, className = '' }) {
  const [failed, setFailed] = useState(false);
  return donation.image?.secureUrl && !failed ? (
    <img
      className={`donor-food-photo ${className}`}
      src={donation.image.secureUrl}
      alt={donation.title}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={`donor-food-placeholder ${className}`}>
      <Leaf size={30} strokeWidth={1.2} aria-hidden="true" />
      <span>No photo provided</span>
    </div>
  );
}
