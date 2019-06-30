import { Component, h } from "preact";

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
      <div data-id={x.id} class={"notification notification-" + x.kind}>
        <div class="notification-kind"><span></span></div>
        <div class="notification-content">{x.message}</div>
        <div class="notification-close" onClick={this.onClose}><span></span></div>
      </div>);

    return <div class="notifications">{elems}</div>;
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
