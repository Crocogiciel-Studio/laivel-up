import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileForm } from './ProfileForm.js';
import { emptyForm } from './form.js';

describe('ProfileForm', () => {
  it('omits an unchecked section from the saved body', () => {
    const onSave = vi.fn();
    render(<ProfileForm saving={false} error={null} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'P1' } });
    fireEvent.change(screen.getByLabelText('Subject id'), { target: { value: 'dev-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [name, body] = onSave.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('P1');
    expect(body).not.toHaveProperty('declared');
  });

  it('includes a section once its checkbox is ticked', () => {
    const onSave = vi.fn();
    render(<ProfileForm saving={false} error={null} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'P1' } });
    fireEvent.change(screen.getByLabelText('Subject id'), { target: { value: 'dev-1' } });
    fireEvent.click(screen.getByLabelText(/Declared/));
    fireEvent.change(screen.getByLabelText('Stack'), { target: { value: 'ts, go' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    const [, body] = onSave.mock.calls[0] as [string, { declared: { stack: string[] } }];
    expect(body.declared.stack).toEqual(['ts', 'go']);
  });

  it('adds and removes a raw pull request row', () => {
    const onSave = vi.fn();
    render(<ProfileForm saving={false} error={null} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'P1' } });
    fireEvent.change(screen.getByLabelText('Subject id'), { target: { value: 'dev-1' } });
    fireEvent.click(screen.getByLabelText(/VCS activity/));
    fireEvent.click(screen.getByRole('button', { name: '+ pull request' }));
    fireEvent.change(screen.getByLabelText('Changed files'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    const [, body] = onSave.mock.calls[0] as [
      string,
      { vcsActivity: { rawPullRequests: { changedFiles: number }[] } },
    ];
    expect(body.vcsActivity.rawPullRequests).toEqual([{ changedFiles: 3 }]);

    fireEvent.click(screen.getByRole('button', { name: 'remove' }));
    expect(screen.queryByLabelText('Changed files')).toBeNull();
  });

  it('blocks the save and shows a local issue on a partial size distribution', () => {
    const onSave = vi.fn();
    const form = emptyForm();
    form.name = 'P1';
    form.subject.id = 'dev-1';
    form.sections.vcsActivity = true;
    form.values['vcsActivity.pullRequests.sd_xs'] = '1';
    render(<ProfileForm initial={form} saving={false} error={null} onSave={onSave} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/fill all five buckets/)).toBeTruthy();
  });

  it('renders a server-side issue passed in via props', () => {
    render(
      <ProfileForm
        saving={false}
        error="profile is invalid"
        issues={['subject.id: Required']}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('profile is invalid')).toBeTruthy();
    expect(screen.getByText('subject.id: Required')).toBeTruthy();
  });

  it('calls onCancel', () => {
    const onCancel = vi.fn();
    render(<ProfileForm saving={false} error={null} onSave={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
