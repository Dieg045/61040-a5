import { ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { NotAllowedError, NotFoundError } from "./errors";

export interface BookmarkDoc extends BaseDoc {
  user: ObjectId;
  name: string;
  destination: string;
}

export default class BookmarkConcept {
  public readonly bookmarks = new DocCollection<BookmarkDoc>("bookmarks");

  async getById(_id: ObjectId) {
    const bookmark = await this.bookmarks.readOne({ _id });
    if (bookmark === null) {
      throw new NotFoundError(`Bookmark not found!`);
    }
    return bookmark;
  }

  async getByOwner(user: ObjectId) {
    const bookmarks = await this.bookmarks.readMany({ user });
    return bookmarks;
  }

  async getByNameAndUser(name: string, user: ObjectId) {
    const bookmark = await this.bookmarks.readOne({ name, user });
    if (!bookmark) {
      throw new NotFoundError(`User ${user} does not have a bookmark named ${name}`);
    }
    return bookmark;
  }

  async create(user: ObjectId, name: string, destination: string) {
    await this.isAvailableName(user, name);
    this.isValidDestination(destination);
    const _id = await this.bookmarks.createOne({ user, name, destination });
    return { msg: "Bookmark created successfully!", bookmark: await this.bookmarks.readOne({ _id }) };
  }

  async delete(_id: ObjectId) {
    await this.bookmarks.deleteOne({ _id });
    return { msg: "Bookmark deleted!" };
  }

  async update(_id: ObjectId, update: Partial<BookmarkDoc>) {
    const bookmark = await this.bookmarks.readOne({ _id });
    if (!bookmark) {
      throw new NotFoundError(`Bookmark ${_id} does not exist!`);
    }
    this.sanitizeUpdate(update);
    if (update.name) {
      await this.isAvailableName(bookmark.user, update.name);
    }
    await this.bookmarks.updateOne({ _id }, update);
    return { msg: "Bookmark updated successfully!" };
  }

  async isOwner(user: ObjectId, _id: ObjectId) {
    const bookmark = await this.bookmarks.readOne({ _id });
    if (!bookmark) {
      throw new NotFoundError(`Bookmark ${_id} does not exist!`);
    }
    if (bookmark.user.toString() !== user.toString()) {
      throw new BookmarkUserNoMatchError(user, _id);
    }
  }

  private async isAvailableName(user: ObjectId, name: string) {
    if (await this.bookmarks.readOne({ user, name })) {
      throw new BookmarkNameAlreadyInUseError(user, name);
    }
  }

  private sanitizeUpdate(update: Partial<BookmarkDoc>) {
    // Make sure the update cannot change the owner.
    const allowedUpdates = ["name", "destination"];
    for (const key in update) {
      if (!allowedUpdates.includes(key)) {
        throw new NotAllowedError(`Cannot update '${key}' field!`);
      }
    }
  }

  private isValidDestination(destination: string) {
    new URL(destination);
  }
}

export class BookmarkNameAlreadyInUseError extends NotAllowedError {
  constructor(
    public readonly user: ObjectId,
    public readonly name: string,
  ) {
    super("{0} already has a bookmark named {1}!", user, name);
  }
}

export class BookmarkUserNoMatchError extends NotAllowedError {
  constructor(
    public readonly user: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} is not the owner of bookmark {1}!", user, _id);
  }
}

export class InvalidURLError extends NotAllowedError {
  constructor(public readonly destination: string) {
    super("{0} is not a valid URL!", destination);
  }
}
