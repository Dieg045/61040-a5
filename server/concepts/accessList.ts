import { Filter, ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { NotAllowedError, NotFoundError } from "./errors";

export interface ItemAccessDoc extends BaseDoc {
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

  async addItem(owner: ObjectId, editors?: ObjectId[], viewers?: ObjectId[]) {
    if (editors === undefined) {
      editors = [];
    }
    if (viewers === undefined) {
      viewers = [];
    }
    const _id = await this.accessList.createOne({ owner, editors, viewers });
    return { msg: "Item successfully added!", item: await this.accessList.readOne({ _id }) };
  }

  async deleteItem(_id: ObjectId) {
    await this.accessList.deleteOne({ _id });
    return { msg: "Item deleted successfully!" };
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

  async removeAccess(_id: ObjectId, user: ObjectId) {
    const item = await this.accessList.readOne({
      _id,
      $or: [{ viewers: user }, { editors: user }],
    });
    if (!item) {
      return { msg: `${user} is already restricted from seeing ${_id}` };
    }

    const userString = user.toString();

    const userViewerIndex = item.viewers.map((viewer) => viewer.toString()).findIndex((viewerString) => viewerString === userString);
    if (userViewerIndex !== -1) {
      const newViewers = item.viewers.slice();
      newViewers.splice(userViewerIndex, 1);
      await this.accessList.updateOne({ _id }, { viewers: newViewers });
      return { msg: "Viewers successfully updated!" };
    }

    const userEditorIndex = item.editors.map((editor) => editor.toString()).findIndex((editorString) => editorString === userString);
    if (userEditorIndex !== -1) {
      const newEditors = item.editors.slice();
      newEditors.splice(userEditorIndex, 1);
      await this.accessList.updateOne({ _id }, { editors: newEditors });
      return { msg: "Viewers successfully updated!" };
    }
  }

  async isOwner(user: ObjectId, _id: ObjectId) {
    const item = await this.accessList.readOne({ _id });
    if (!item) {
      throw new NotFoundError(`Item ${_id} does not exist!`);
    }
    if (item.owner.toString() !== user.toString()) {
      throw new ItemOwnerNotMatchError(user, _id);
    }
  }

  async isViewer(user: ObjectId, _id: ObjectId) {
    const item = await this.accessList.readOne({ _id });
    if (!item) {
      throw new NotFoundError(`Item ${_id} does not exist!`);
    }
    if (!item.viewers.map((viewer) => viewer.toString()).includes(user.toString())) {
      throw new ItemViewerNotMatchError(user, _id);
    }
  }

  async isEditor(user: ObjectId, _id: ObjectId) {
    const item = await this.accessList.readOne({ _id });
    if (!item) {
      throw new NotFoundError(`Item ${_id} does not exist!`);
    }
    if (!item.editors.map((viewer) => viewer.toString()).includes(user.toString())) {
      throw new ItemEditorNotMatchError(user, _id);
    }
  }
}

export class ItemOwnerNotMatchError extends NotAllowedError {
  constructor(
    public readonly owner: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} is not the owner of item {1}!", owner, _id);
  }
}

export class ItemOwnerMatchError extends NotAllowedError {
  constructor(
    public readonly owner: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} is the owner of item {1}!", owner, _id);
  }
}

export class ItemViewerNotMatchError extends NotAllowedError {
  constructor(
    public readonly viewer: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} is not a viewer of item {1}!", viewer, _id);
  }
}

export class ItemEditorNotMatchError extends NotAllowedError {
  constructor(
    public readonly editor: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} is not an editor of item {1}!", editor, _id);
  }
}

export class UserAlreadyViewerError extends NotAllowedError {
  constructor(
    public readonly viewer: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} is already a viewer of item {1}!", viewer, _id);
  }
}

export class UserAlreadyEditorError extends NotAllowedError {
  constructor(
    public readonly editor: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} is already an editor of item {1}!", editor, _id);
  }
}
