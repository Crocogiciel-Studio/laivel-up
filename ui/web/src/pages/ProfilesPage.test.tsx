import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

class MockApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues: readonly string[] = [],
  ) {
    super(message);
  }
}

vi.mock('../org/OrgProvider.js', () => ({
  useOrg: () => ({ currentOrg: { id: 'o1', name: 'Acme', createdAt: '' } }),
}));
vi.mock('../api/client.js', () => ({ ApiError: MockApiError }));

const listProfiles = vi.fn();
const createProfile = vi.fn();
const deleteProfile = vi.fn();
const updateProfile = vi.fn();
vi.mock('../profile/profileApi.js', () => ({
  listProfiles: (...a: unknown[]) => listProfiles(...a),
  createProfile: (...a: unknown[]) => createProfile(...a),
  updateProfile: (...a: unknown[]) => updateProfile(...a),
  deleteProfile: (...a: unknown[]) => deleteProfile(...a),
}));

const { ProfilesPage } = await import('./ProfilesPage.js');

const TEMPLATE = {
  id: 't1',
  orgId: null,
  createdBy: null,
  name: 'AIDD reference',
  body: { subject: { id: 'ref' }, declared: { stack: ['ts'] } },
  isTemplate: true,
  updatedAt: '',
};

afterEach(() => {
  listProfiles.mockReset();
  createProfile.mockReset();
  deleteProfile.mockReset();
  updateProfile.mockReset();
});

describe('ProfilesPage', () => {
  it('lists owned profiles and templates separately', async () => {
    listProfiles.mockResolvedValue([
      { id: 'p1', orgId: 'o1', createdBy: 'u1', name: 'My profile', body: {}, isTemplate: false, updatedAt: '' },
      TEMPLATE,
    ]);
    render(<ProfilesPage />);
    await waitFor(() => expect(screen.getByText('My profile')).toBeTruthy());
    expect(screen.getByText('AIDD reference')).toBeTruthy();
    expect(screen.getByText('Templates')).toBeTruthy();
  });

  it('creates a new profile and returns to the list', async () => {
    listProfiles.mockResolvedValue([]);
    createProfile.mockResolvedValue({});
    render(<ProfilesPage />);
    await waitFor(() => expect(screen.getByText('No profiles yet.')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'New profile' }));
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'New one' } });
    fireEvent.change(screen.getByLabelText('Subject id'), { target: { value: 'dev-x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    await waitFor(() => expect(createProfile).toHaveBeenCalledWith('o1', 'New one', expect.any(Object)));
    await waitFor(() => expect(screen.getByText('Profiles')).toBeTruthy());
  });

  it('shows the server issues on a 422 and clears them on cancel', async () => {
    listProfiles.mockResolvedValue([]);
    createProfile.mockRejectedValue(new MockApiError(422, 'profile is invalid', ['subject.id: Required']));
    render(<ProfilesPage />);
    await waitFor(() => expect(screen.getByText('No profiles yet.')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'New profile' }));
    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => expect(screen.getByText('profile is invalid')).toBeTruthy());
    expect(screen.getByText('subject.id: Required')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'New profile' }));
    expect(screen.queryByText('profile is invalid')).toBeNull();
  });

  it('clones a template into a fresh editable draft', async () => {
    listProfiles.mockResolvedValue([TEMPLATE]);
    render(<ProfilesPage />);
    await waitFor(() => expect(screen.getByText('AIDD reference')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'clone to edit' }));
    expect(screen.getByText('New profile')).toBeTruthy();
    expect((screen.getByLabelText('Profile name') as HTMLInputElement).value).toBe('AIDD reference (copy)');
    expect((screen.getByLabelText('Subject id') as HTMLInputElement).value).toBe('ref');
  });

  it('surfaces the delete error instead of swallowing it', async () => {
    listProfiles.mockResolvedValue([
      { id: 'p1', orgId: 'o1', createdBy: 'u1', name: 'Mine', body: {}, isTemplate: false, updatedAt: '' },
    ]);
    deleteProfile.mockRejectedValue(new MockApiError(403, 'not allowed to change this profile'));
    render(<ProfilesPage />);
    await waitFor(() => expect(screen.getByText('Mine')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'delete' }));
    await waitFor(() => expect(screen.getByText('not allowed to change this profile')).toBeTruthy());
  });
});
