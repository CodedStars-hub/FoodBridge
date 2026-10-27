import DonorDonationCard from '../components/DonorDonationCard.jsx';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { useApiData } from '../hooks/useApiData.js';
import {
  DonationCard,
  Pagination,
  DataState,
} from '../components/DonationShared.jsx';
import { categoryOptions, unitOptions, readable } from '../utils/donation.js';
export default function DonationsPage({ mine = false }) {
  const [filters, setFilters] = useState({
    q: '',
    category: '',
    unit: '',
    status: '',
  });
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({
    page,
    ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value)),
  });
  const result = useApiData(`/donations${mine ? '/mine' : ''}?${query}`);
  function filter(name, value) {
    setFilters({ ...filters, [name]: value });
    setPage(1);
  }
  return (
    <section className="workspace-page">
      <div className="workspace-title">
        <div>
          <span className="eyebrow">
            {mine ? 'YOUR SHARED TABLE' : 'GOOD FOOD. LOCAL POSSIBILITY.'}
          </span>
          <h1>{mine ? 'My donations' : 'Explore donations'}</h1>
          <p>
            {mine
              ? 'Manage the food you share and keep track of every handover.'
              : 'Discover surplus food shared by donors. Only verified NGOs can request food.'}
          </p>
        </div>
        {mine && (
          <Link className="button" to="/dashboard/donor/donations/new">
            <Plus size={17} />
            Create donation
          </Link>
        )}
      </div>
      <form
        className="donation-filters"
        role="search"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="search-field">
          <span>
            <Search size={15} />
            Search donations
          </span>
          <input
            value={filters.q}
            onChange={(event) => filter('q', event.target.value)}
            placeholder="Search by title"
            maxLength={100}
          />
        </label>
        <label>
          Category
          <select
            value={filters.category}
            onChange={(event) => filter('category', event.target.value)}
          >
            <option value="">All categories</option>
            {categoryOptions.map((value) => (
              <option key={value} value={value}>
                {readable(value)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Unit
          <select
            value={filters.unit}
            onChange={(event) => filter('unit', event.target.value)}
          >
            <option value="">All units</option>
            {unitOptions.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        {mine && (
          <label>
            Status
            <select
              value={filters.status}
              onChange={(event) => filter('status', event.target.value)}
            >
              <option value="">All statuses</option>
              {[
                'available',
                'reserved',
                'completed',
                'cancelled',
                'expired',
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        )}
      </form>
      <DataState
        {...result}
        retry={result.refresh}
        empty={result.data?.items.length === 0}
        emptyContent={
          mine ? (
            <div className="workspace-state empty-state">
              <h2>
                {Object.values(filters).some(Boolean)
                  ? 'No matching donations.'
                  : 'Make room for your first good connection.'}
              </h2>
              <p>
                {Object.values(filters).some(Boolean)
                  ? 'Try a different search, or clear your filters.'
                  : 'Share surplus food with a clear quantity and collection deadline.'}
              </p>
              {Object.values(filters).some(Boolean) ? (
                <button
                  className="button button-outline"
                  onClick={() => {
                    setFilters({ q: '', category: '', unit: '', status: '' });
                    setPage(1);
                  }}
                >
                  Clear filters
                </button>
              ) : (
                <Link className="button" to="/dashboard/donor/donations/new">
                  Create your first donation
                </Link>
              )}
            </div>
          ) : (
            <div className="workspace-state empty-state">
              <h2>Nothing here just yet.</h2>
              <p>
                Try changing your filters or check back as the community shares
                more food.
              </p>
              {Object.values(filters).some(Boolean) && (
                <button
                  className="button button-outline"
                  onClick={() => {
                    setFilters({ q: '', category: '', unit: '', status: '' });
                    setPage(1);
                  }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )
        }
      >
        <div className="donations-grid">
          {result.data?.items.map((donation) =>
            mine ? (
              <DonorDonationCard
                key={donation._id}
                donation={donation}
                refresh={result.refresh}
              />
            ) : (
              <DonationCard key={donation._id} donation={donation} />
            ),
          )}
        </div>
        <Pagination pagination={result.data?.pagination} onPage={setPage} />
      </DataState>
      <p className="declaration-note">
        Preparation, storage, handling and allergen information are donor
        declarations. A pickup deadline is a collection cutoff, not a
        certification of food safety.
      </p>
    </section>
  );
}
