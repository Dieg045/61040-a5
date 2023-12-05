import { Filter, ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { NotAllowedError, NotFoundError } from "./errors";

export interface ItemAccessDoc extends BaseDoc {
  item: ObjectId;
  owner: ObjectId;
  editors: ObjectId[];
  viewers: ObjectId[];
}

export default class AccessListConcept {
  public readonly accessList = new DocCollection<ItemAccessDoc>("accessList");

  async getItems(query: Filter<ItemAccessDoc>) {
    const items = await this.accessList.readMany(query, {
      sort: { dateUpdated: -1 },
    });
    return items;
  }

  async getItemsByOwner(owner: ObjectId) {
    return await this.getItems({ owner });
  }

  async addItem(item: ObjectId, owner: ObjectId, editors?: ObjectId[], viewers?: ObjectId[]) {
    if (editors === undefined) {
      editors = [];
    }
    if (viewers === undefined) {
      viewers = [];
    }
    const _id = await this.accessList.createOne({ item, owner, editors, viewers });
    return { msg: "Item successfully added!", item: await this.accessList.readOne({ _id }) };
  }

  async deleteItem(item: ObjectId) {
    await this.accessList.deleteOne({ item });
    return { msg: "Item deleted successfully!" };
  }

  async setToViewerAllItems(owner: ObjectId, user: ObjectId) {
    const userString = user.toString();

    const items = await this.getItemsByOwner(owner);
    for (const item of items) {
      if (!item.viewers.some((viewer) => viewer.toString() === userString)) {
        const newViewers = item.viewers.slice();
        newViewers.push(user);
        await this.accessList.updateOne({ _id: item._id }, { viewers: newViewers });
      }
    }
    return { msg: "Access to all items successfully updated!" };
  }

  async setToViewer(_id: ObjectId, user: ObjectId) {
    try {
      await this.isViewer(user, _id);
      return { msg: `${user} is already a viewer of ${_id}` };
    } catch (e) {
      const item = await this.accessList.readOne({ _id });
      if (!item) {
        throw new NotFoundError(`Item ${_id} does not exist!`);
      }

      const newViewers = item.viewers.slice();
      newViewers.push(user);
      await this.accessList.updateOne({ _id }, { viewers: newViewers });
      return { msg: "Viewers successfully updated!" };
    }
  }

  async setToEditor(_id: ObjectId, user: ObjectId) {
    try {
      await this.isEditor(user, _id);
      return { msg: `${user} is already an editor of ${_id}` };
    } catch (e) {
      const item = await this.accessList.readOne({ _id });
      if (!item) {
        throw new NotFoundError(`Item ${_id} does not exist!`);
      }

      const newEditors = item.editors.slice();
      newEditors.push(user);
      await this.accessList.updateOne({ _id }, { editors: newEditors });
      return { msg: "Editors successfully updated!" };
    }
  }

  async removeAccessAllItems(owner: ObjectId, user: ObjectId) {
    const items = await this.accessList.readMany({
      owner,
      $or: [{ viewers: user }, { editors: user }],
    });

    const userString = user.toString();

    for (const item of items) {
      const userViewerIndex = item.viewers.map((viewer) => viewer.toString()).findIndex((viewerString) => viewerString === userString);
      if (userViewerIndex !== -1) {
        const newViewers = item.viewers.slice();
        newViewers.splice(userViewerIndex, 1);
        await this.accessList.updateOne({ _id: item._id }, { viewers: newViewers });
      } else {
        const userEditorIndex = item.editors.map((editor) => editor.toString()).findIndex((editorString) => editorString === userString);
        const newEditors = item.editors.slice();
        newEditors.splice(userEditorIndex, 1);
        await this.accessList.updateOne({ _id: item._id }, { editors: newEditors });
      }
    }
    return { msg: `Access for ${user} was successfully updated!` };
  }

  async removeAccess(itemId: ObjectId, user: ObjectId) {
    const item = await this.accessList.readOne({
      itemId,
      $or: [{ viewers: user }, { editors: user }],
    });
    if (!item) {
      return { msg: `${user} is already restricted from seeing ${itemId}` };
    }

    const userString = user.toString();

    const userViewerIndex = item.viewers.map((viewer) => viewer.toString()).findIndex((viewerString) => viewerString === userString);
    if (userViewerIndex !== -1) {
      const newViewers = item.viewers.slice();
      newViewers.splice(userViewerIndex, 1);
      await this.accessList.updateOne({ itemId }, { viewers: newViewers });
      return { msg: "Viewers successfully updated!" };
    } else {
      const userEditorIndex = item.editors.map((editor) => editor.toString()).findIndex((editorString) => editorString === userString);
      const newEditors = item.editors.slice();
      newEditors.splice(userEditorIndex, 1);
      await this.accessList.updateOne({ itemId }, { editors: newEditors });
      return { msg: "Editors successfully updated!" };
    }
  }

  async isOwner(user: ObjectId, itemId: ObjectId) {
    const item = await this.accessList.readOne({ item: itemId });
    if (!item) {
      throw new NotFoundError(`Item ${itemId} does not exist!`);
    }
    if (item.owner.toString() !== user.toString()) {
      throw new ItemOwnerNotMatchError(user, itemId);
    }
  }

  async isViewer(user: ObjectId, itemId: ObjectId) {
    const item = await this.accessList.readOne({ itemId });
    if (!item) {
      throw new NotFoundError(`Item ${itemId} does not exist!`);
    }
    if (!item.viewers.map((viewer) => viewer.toString()).includes(user.toString())) {
      throw new ItemViewerNotMatchError(user, itemId);
    }
  }

  async isEditor(user: ObjectId, itemId: ObjectId) {
    const item = await this.accessList.readOne({ itemId });
    if (!item) {
      throw new NotFoundError(`Item ${itemId} does not exist!`);
    }
    if (!item.editors.map((viewer) => viewer.toString()).includes(user.toString())) {
      throw new ItemEditorNotMatchError(user, itemId);
    }
  }

  async canView(user: ObjectId, itemId: ObjectId) {
    const item = await this.accessList.readOne({ itemId });
    if (!item) {
      throw new NotFoundError(`Item ${itemId} does not exist!`);
    }

    if (!this.hasItemAccess(item, user)) {
      throw new AccessRestrictedError(user, itemId);
    }
  }

  private hasItemAccess(item: ItemAccessDoc, user: ObjectId) {
    const userString = user.toString();
    const isOwner = item.owner.toString() === userString;
    const isViewer = item.viewers.map((viewer) => viewer.toString()).includes(userString);
    const isEditor = item.editors.map((viewer) => viewer.toString()).includes(userString);

    return isOwner || isViewer || isEditor;
  }
}

export class ItemOwnerNotMatchError extends NotAllowedError {
  constructor(
    public readonly owner: ObjectId,
    public readonly item: ObjectId,
  ) {
    super("{0} is not the owner of item {1}!", owner, item);
  }
}

export class ItemOwnerMatchError extends NotAllowedError {
  constructor(
    public readonly owner: ObjectId,
    public readonly item: ObjectId,
  ) {
    super("{0} is the owner of item {1}!", owner, item);
  }
}

export class ItemViewerNotMatchError extends NotAllowedError {
  constructor(
    public readonly viewer: ObjectId,
    public readonly item: ObjectId,
  ) {
    super("{0} is not a viewer of item {1}!", viewer, item);
  }
}

export class ItemEditorNotMatchError extends NotAllowedError {
  constructor(
    public readonly editor: ObjectId,
    public readonly item: ObjectId,
  ) {
    super("{0} is not an editor of item {1}!", editor, item);
  }
}

export class UserAlreadyViewerError extends NotAllowedError {
  constructor(
    public readonly viewer: ObjectId,
    public readonly item: ObjectId,
  ) {
    super("{0} is already a viewer of item {1}!", viewer, item);
  }
}

export class UserAlreadyEditorError extends NotAllowedError {
  constructor(
    public readonly editor: ObjectId,
    public readonly item: ObjectId,
  ) {
    super("{0} is already an editor of item {1}!", editor, item);
  }
}

export class AccessRestrictedError extends NotAllowedError {
  constructor(
    public readonly user: ObjectId,
    public readonly item: ObjectId,
  ) {
    super("{0} is not allowed to access item {1}!", user, item);
  }
}
