import type { Product } from '../agent/types';
import { formatPrice } from '../lib/money';

interface ProductCardProps {
  product: Product;
  disabled: boolean;
  onAdd: (product: Product) => void;
}

export function ProductCard({ product, disabled, onAdd }: ProductCardProps) {
  return (
    <article className="product-card">
      <div className="product-card-header">
        <span className="category-pill">{product.category}</span>
        <span className="product-price">{formatPrice(product.price_cents)}</span>
      </div>
      <h3 className="product-name">{product.name}</h3>
      <p className="product-description">{product.description}</p>
      <div className="tag-row">
        {product.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
      </div>
      <button className="button button-primary button-small" type="button" disabled={disabled} onClick={() => onAdd(product)}>
        Add to basket
      </button>
    </article>
  );
}
