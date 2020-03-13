import { Component, JSX, h } from "preact";
import {
  notification, notificationClose, notificationContent, notificationKind, notifications as notificationsCls,
} from "../styles.css";

export const enum NotificationKind {
  Ok = "ok",
  Warn = "warn",
  Error = "error",
}

export type NotificationBody = string | JSX.Element;

export type Notification = {
  id: string,
  kind: NotificationKind,
  message: NotificationBody,
};

export type NotificationsProps = {
  notifications: Notification[],
  onClose: (id: string) => void,
};

export class Notifications extends Component<NotificationsProps, {}> {
  public render({ notifications }: NotificationsProps, { }: {}) {
    const elems = notifications.map(x =>
      // TODO: This!
      <div data-id={x.id} class={`${notification} notification-${x.kind}`}>
        <div class={notificationKind}><span></span></div>
        <div class={notificationContent}>{x.message}</div>
        <div class={notificationClose} onClick={this.onClose}><span></span></div>
      </div>);

    return <div class={notificationsCls}>{elems}</div>;
  }

  private onClose = (event: MouseEvent) => {
    event.preventDefault();

    const target = event.target as Element | null;
    if (!target || !target.parentElement) return;
    const id = target.getAttribute("data-id");
    if (id === null) return;

    this.props.onClose(id);
  }
}
