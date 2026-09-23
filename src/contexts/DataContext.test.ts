import { resolveCategoryIdForUpdate, isPermissionDeniedOrRlsError } from './DataContext';

describe('isPermissionDeniedOrRlsError', () => {
  it('detects admin permission and row-level security rejections', () => {
    expect(isPermissionDeniedOrRlsError({ code: '42501', message: 'permission denied for table products' })).toBe(true);
    expect(isPermissionDeniedOrRlsError({ code: 'PGRST301', message: 'JWT expired' })).toBe(true);
    expect(isPermissionDeniedOrRlsError({ code: '23505', message: 'duplicate key value violates unique constraint' })).toBe(false);
  });
});

describe('resolveCategoryIdForUpdate', () => {
  it('returns a UUID as-is for a precise category id', async () => {
    const supabaseClient = {
      from: jest.fn(),
    };

    await expect(
      resolveCategoryIdForUpdate('123e4567-e89b-42d3-a456-426614174000', [{ id: 'other', label: 'Other' }], supabaseClient as any)
    ).resolves.toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(supabaseClient.from).not.toHaveBeenCalled();
  });

  it('resolves a category by slug to a single unique database id', async () => {
    const limit = jest.fn().mockResolvedValue({ data: [{ id: 'cat-uuid-123' }], error: null });
    const eq = jest.fn().mockReturnValue({ limit });
    const select = jest.fn().mockReturnValue({ eq });
    const supabaseClient = {
      from: jest.fn().mockReturnValue({ select }),
    };

    await expect(resolveCategoryIdForUpdate('skincare', [{ id: 'other', label: 'Other' }], supabaseClient as any)).resolves.toBe('cat-uuid-123');
    expect(supabaseClient.from).toHaveBeenCalledWith('categories');
    expect(select).toHaveBeenCalledWith('id');
    expect(eq).toHaveBeenCalledWith('slug', 'skincare');
  });
});
