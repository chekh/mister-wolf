"""Стартовое наполнение хранилища (вызывается фабрикой тестов один раз)."""
from __future__ import annotations

from app.utils.store import insert

_DONE = False

def run_once() -> None:
    """Идемпотентно сеет данные."""
    global _DONE
    if _DONE:
        return
    _DONE = True
    insert("users", {"name": "users-name-alpha", "email": "users-email-alpha", "age": 7, "status": "users-status-alpha", "logins": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("users", {"name": "users-name-beta", "email": "users-email-beta", "age": 7, "status": "users-status-beta", "logins": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("products", {"sku": "products-sku-alpha", "title": "products-title-alpha", "price": 7, "currency": "products-currency-alpha", "stock": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("products", {"sku": "products-sku-beta", "title": "products-title-beta", "price": 7, "currency": "products-currency-beta", "stock": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("orders", {"ref": "orders-ref-alpha", "customer": "orders-customer-alpha", "total": 7, "channel": "orders-channel-alpha", "items": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("orders", {"ref": "orders-ref-beta", "customer": "orders-customer-beta", "total": 7, "channel": "orders-channel-beta", "items": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("sessions", {"token": "sessions-token-alpha", "user": "sessions-user-alpha", "ttl": 7, "scope": "sessions-scope-alpha", "refreshes": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("sessions", {"token": "sessions-token-beta", "user": "sessions-user-beta", "ttl": 7, "scope": "sessions-scope-beta", "refreshes": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("inventory", {"sku": "inventory-sku-alpha", "warehouse": "inventory-warehouse-alpha", "qty": 7, "bin": "inventory-bin-alpha", "reserved": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("inventory", {"sku": "inventory-sku-beta", "warehouse": "inventory-warehouse-beta", "qty": 7, "bin": "inventory-bin-beta", "reserved": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("notifications", {"topic": "notifications-topic-alpha", "message": "notifications-message-alpha", "priority": 7, "lang": "notifications-lang-alpha", "attempts": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("notifications", {"topic": "notifications-topic-beta", "message": "notifications-message-beta", "priority": 7, "lang": "notifications-lang-beta", "attempts": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("reports", {"code": "reports-code-alpha", "title": "reports-title-alpha", "period": "reports-period-alpha", "owner": "reports-owner-alpha", "weight": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("reports", {"code": "reports-code-beta", "title": "reports-title-beta", "period": "reports-period-beta", "owner": "reports-owner-beta", "weight": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("searches", {"query": "searches-query-alpha", "scope": "searches-scope-alpha", "limit": 7, "locale": "searches-locale-alpha", "hits": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("searches", {"query": "searches-query-beta", "scope": "searches-scope-beta", "limit": 7, "locale": "searches-locale-beta", "hits": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("billings", {"invoice": "billings-invoice-alpha", "customer": "billings-customer-alpha", "amount": 7, "method": "billings-method-alpha", "attempts": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("billings", {"invoice": "billings-invoice-beta", "customer": "billings-customer-beta", "amount": 7, "method": "billings-method-beta", "attempts": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("shipments", {"tracking": "shipments-tracking-alpha", "carrier": "shipments-carrier-alpha", "weight": 7, "mode": "shipments-mode-alpha", "parcels": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("shipments", {"tracking": "shipments-tracking-beta", "carrier": "shipments-carrier-beta", "weight": 7, "mode": "shipments-mode-beta", "parcels": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("coupons", {"code": "coupons-code-alpha", "discount": 7, "uses": 7, "tier": "coupons-tier-alpha", "days": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("coupons", {"code": "coupons-code-beta", "discount": 7, "uses": 7, "tier": "coupons-tier-beta", "days": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("reviews", {"ref": "reviews-ref-alpha", "author": "reviews-author-alpha", "stars": 7, "status": "reviews-status-alpha", "votes": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("reviews", {"ref": "reviews-ref-beta", "author": "reviews-author-beta", "stars": 7, "status": "reviews-status-beta", "votes": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("tickets", {"num": "tickets-num-alpha", "subject": "tickets-subject-alpha", "urgency": 7, "queue": "tickets-queue-alpha", "escalations": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("tickets", {"num": "tickets-num-beta", "subject": "tickets-subject-beta", "urgency": 7, "queue": "tickets-queue-beta", "escalations": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("webhooks", {"url": "webhooks-url-alpha", "event": "webhooks-event-alpha", "retries": 7, "format": "webhooks-format-alpha", "failures": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("webhooks", {"url": "webhooks-url-beta", "event": "webhooks-event-beta", "retries": 7, "format": "webhooks-format-beta", "failures": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("profiles", {"login": "profiles-login-alpha", "display": "profiles-display-alpha", "karma": 7, "plan": "profiles-plan-alpha", "badges": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
    insert("profiles", {"login": "profiles-login-beta", "display": "profiles-display-beta", "karma": 7, "plan": "profiles-plan-beta", "badges": 7, "revision": 1, "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00"})
