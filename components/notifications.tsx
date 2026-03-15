"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Bell,
  CheckCheck,
  CreditCard,
  CheckCircle2,
  Clock,
  Info,
  AlertTriangle,
  AlertCircle,
  Inbox,
} from "lucide-react";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "danger";
  read: boolean;
  invoiceId?: string;
  actionType?: string;
  createdAt: string;
}

interface NotificationsProps {
  open: boolean;
  onClose: () => void;
  onAction: (notification: {
    id: string;
    invoiceId?: string;
    actionType?: string;
  }) => void;
}

const typeColors: Record<string, { bg: string; text: string; badge: string }> = {
  info: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    badge: "bg-blue-100 text-blue-700",
  },
  warning: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    badge: "bg-amber-100 text-amber-700",
  },
  success: {
    bg: "bg-green-50",
    text: "text-green-700",
    badge: "bg-green-100 text-green-700",
  },
  danger: {
    bg: "bg-red-50",
    text: "text-red-700",
    badge: "bg-red-100 text-red-700",
  },
};

const typeIcons: Record<string, React.ReactNode> = {
  info: <Info className="h-4 w-4" />,
  warning: <AlertTriangle className="h-4 w-4" />,
  success: <CheckCircle2 className="h-4 w-4" />,
  danger: <AlertCircle className="h-4 w-4" />,
};

function timeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function getActionButtons(actionType?: string) {
  switch (actionType) {
    case "pay":
      return [
        { label: "Pay now", icon: <CreditCard className="h-3.5 w-3.5" /> },
      ];
    case "confirm":
      return [
        { label: "Mark paid", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
      ];
    case "remind":
      return [
        { label: "Remind later", icon: <Clock className="h-3.5 w-3.5" /> },
      ];
    default:
      return [
        { label: "Pay now", icon: <CreditCard className="h-3.5 w-3.5" /> },
        { label: "Remind later", icon: <Clock className="h-3.5 w-3.5" /> },
      ];
  }
}

export function Notifications({
  open,
  onClose,
  onAction,
}: NotificationsProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, fetchNotifications]);

  const markAllRead = async () => {
    try {
      const res = await fetch("/api/notifications/read", { method: "POST" });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, read: true }))
        );
      }
    } catch (error) {
      console.error("Failed to mark notifications as read:", error);
    }
  };

  const handleAction = (notification: Notification) => {
    onAction({
      id: notification.id,
      invoiceId: notification.invoiceId,
      actionType: notification.actionType,
    });
  };

  if (!open) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-md bg-white shadow-xl flex flex-col h-full animate-in slide-in-from-right">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-gray-700" />
            <h2 className="text-lg font-semibold text-gray-900">
              Notifications
            </h2>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-red-500 text-white text-xs font-medium">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                <CheckCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Mark all read</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="h-6 w-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400 px-4">
              <Inbox className="h-12 w-12 mb-3" />
              <p className="text-base font-medium text-gray-500">
                All caught up!
              </p>
              <p className="text-sm text-gray-400 mt-1">
                No new notifications.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {notifications.map((notification) => {
                const colors =
                  typeColors[notification.type] || typeColors.info;
                const icon = typeIcons[notification.type] || typeIcons.info;
                const actions = getActionButtons(notification.actionType);

                return (
                  <li
                    key={notification.id}
                    className={`px-4 py-3 transition-colors ${
                      notification.read
                        ? "bg-white"
                        : "bg-gray-50 border-l-2 border-l-blue-500"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex-shrink-0 mt-0.5 p-1.5 rounded-full ${colors.bg} ${colors.text}`}
                      >
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {notification.title}
                          </p>
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${colors.badge}`}
                          >
                            {notification.type}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {notification.message}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-400">
                            {timeAgo(notification.createdAt)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {actions.map((action) => (
                              <button
                                key={action.label}
                                onClick={() => handleAction(notification)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                              >
                                {action.icon}
                                {action.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
