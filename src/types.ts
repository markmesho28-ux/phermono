export type CategoryIcon = "Sparkles" | "Wind" | "Palette" | "Droplets" | "Star";

export interface CategorySubcategory {
  id: string;
  label: string;
}

export interface Category {
  id: string;
  label: string;
  icon: CategoryIcon;
  color: string;
  accent: string;
  subcategories: CategorySubcategory[];
  brands?: string[];
}

export interface Product {
  id: number;
  name: string;
  brand: string;
  category: string;
  subcategory: string;
  price: number;
  originalPrice?: number | null;
  sellingPrice?: number;
  marketPrice?: number | null;
  adminCost?: number;
  rating: number;
  reviews: number;
  skinType?: string | null;
  tag?: string | null;
  hero?: boolean;
  image: string;
  description: string;
}

export interface PriceRange {
  id: string;
  label: string;
  min?: number;
  max?: number;
}

export interface OrderItem {
  id: number | string;
  name: string;
  qty: number;
  price: number;
}

export interface Order {
  id: number;
  name: string;
  phone: string;
  governorate: string;
  address: string;
  items: OrderItem[];
  total: number;
  shipping?: number;
  status: string;
  createdAt: number | string;
}

export type OrderInput = Omit<Order, "id" | "createdAt"> & {
  createdAt?: number | string;
};

export interface AuthUser {
  name: string;
  phone: string;
  address: string;
  governorate: string;
  role: string;
  password?: string;
}

export interface AuthUserWithPassword extends AuthUser {
  password: string;
}

export interface SignupParams {
  name: string;
  phone: string;
  address: string;
  governorate: string;
  password: string;
}

export interface LoginParams {
  phone: string;
  password: string;
}

export interface ProfileUpdate {
  name?: string;
  phone?: string;
  governorate?: string;
  address?: string;
}

export interface CartItem extends Product {
  qty: number;
  price: number;
}

export interface DataActions {
  addCategory: (cat: Category) => Promise<void>;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  addSubcategory: (categoryId: string, sub: CategorySubcategory) => Promise<any>;
  updateSubcategory: (categoryId: string, subId: string, updates: Partial<CategorySubcategory>) => void;
  deleteSubcategory: (categoryId: string, subId: string) => void;
  addBrand: (name: string, categoryId?: string) => Promise<any>;
  updateBrand: (oldName: string, newName: string) => void;
  deleteBrand: (name: string) => void;
  addProduct: (prod: Product) => Promise<number>;
  updateProduct: (id: number, updates: Partial<Product>) => void;
  deleteProduct: (id: number) => void;
  toggleHero: (id: number) => void;
  addOrder: (order: OrderInput) => number;
  updateOrder: (id: number, updates: Partial<Order>) => void;
  deleteOrder: (id: number) => void;
}

export interface DataContextValue {
  categories: Category[];
  brands: string[];
  products: Product[];
  priceRanges: PriceRange[];
  orders: Order[];
  actions: DataActions;
}

export interface AuthContextValue {
  user: AuthUser | null;
  users: AuthUserWithPassword[];
  signup: (params: SignupParams) => Promise<{ error?: string; user?: AuthUser }>;
  login: (params: LoginParams) => Promise<{ error?: string; user?: AuthUser }>;
  logout: () => void;
  updateProfile: (updates: ProfileUpdate) => { error?: string; user?: AuthUser };
  changePassword: (params: { currentPassword: string; newPassword: string }) => { error?: string; ok?: boolean };
}
