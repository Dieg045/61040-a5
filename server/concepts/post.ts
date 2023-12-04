import { Filter, ObjectId } from "mongodb";

import DocCollection, { BaseDoc } from "../framework/doc";
import { NotAllowedError, NotFoundError } from "./errors";

export interface PostOptions {
  backgroundColor?: string;
  restrictedUsers?: Array<ObjectId>;
}

export interface PostDoc extends BaseDoc {
  author: ObjectId;
  content: string;
  options?: PostOptions | null;
}

export default class PostConcept {
  public readonly posts = new DocCollection<PostDoc>("posts");

  async create(author: ObjectId, content: string, options?: PostOptions) {
    const _id = await this.posts.createOne({ author, content, options });
    return { msg: "Post successfully created!", post: await this.posts.readOne({ _id }) };
  }

  async getPosts(query: Filter<PostDoc>) {
    const posts = await this.posts.readMany(query, {
      sort: { dateUpdated: -1 },
    });
    return posts;
  }

  async getByAuthor(author: ObjectId) {
    return await this.getPosts({ author });
  }

  async update(_id: ObjectId, update: Partial<PostDoc>) {
    this.sanitizeUpdate(update);
    await this.posts.updateOne({ _id }, update);
    return { msg: "Post successfully updated!" };
  }

  async delete(_id: ObjectId) {
    await this.posts.deleteOne({ _id });
    return { msg: "Post deleted successfully!" };
  }

  async isAuthor(user: ObjectId, _id: ObjectId) {
    const post = await this.posts.readOne({ _id });
    if (!post) {
      throw new NotFoundError(`Post ${_id} does not exist!`);
    }
    if (post.author.toString() !== user.toString()) {
      throw new PostAuthorNotMatchError(user, _id);
    }
  }

  //realized I can just use the update method
  async addRestrictedUser(user: ObjectId, _id: ObjectId) {
    const post = await this.posts.readOne({ _id });
    if (!post) {
      throw new NotFoundError(`Post ${_id} does not exist!`);
    }

    const newRestrictedUsers = [user];
    if (post.options && post.options.restrictedUsers) {
      // const hasUser = post.options.restrictedUsers.some((id) => id.toString() === userStr);
      if (this.hasUser(user, post.options.restrictedUsers)) {
        throw new PostUserAlreadyRestrictedError(user, _id);
      }

      newRestrictedUsers.concat(post.options.restrictedUsers);
    }

    //might need to fix this! Perhaps need to use array instead
    const update = JSON.parse(`{ $set: { "options" : { "restrictedUsers" : ${newRestrictedUsers} } } }`);

    this.sanitizeUpdate(update);
    await this.posts.updateOne({ _id }, update);
    return { msg: "Post successfully updated!" };
  }

  async removeRestrictedUser(user: ObjectId, _id: ObjectId) {
    const userStr = user.toString();
    const post = await this.posts.readOne({ _id });
    if (!post) {
      throw new NotFoundError(`Post ${_id} does not exist!`);
    }

    const newRestrictedUsers: ObjectId[] = [];
    if (post.options && post.options.restrictedUsers) {
      const userFilteredOut = post.options.restrictedUsers.filter((id) => id.toString() !== userStr);
      if (userFilteredOut.length === post.options.restrictedUsers.length) {
        throw new PostUserAlreadyUnrestrictedError(user, _id);
      }

      newRestrictedUsers.concat(userFilteredOut);
    }

    //might need to fix this! Perhaps need to use array instead
    const update = JSON.parse(`{ $set: { "options" : { "restrictedUsers" : ${newRestrictedUsers} } } }`);

    this.sanitizeUpdate(update);
    await this.posts.updateOne({ _id }, update);
    return { msg: "Post successfully updated!" };
  }

  async canView(user: ObjectId, _id: ObjectId) {
    const post = await this.posts.readOne({ _id });
    if (!post) {
      throw new NotFoundError(`Post ${_id} does not exist!`);
    }
    if (post.options && post.options.restrictedUsers && this.hasUser(user, post.options.restrictedUsers)) {
      throw new RestrictedPostAccessError(user, _id);
    }
  }

  private sanitizeUpdate(update: Partial<PostDoc>) {
    // Make sure the update cannot change the author.
    const allowedUpdates = ["content", "options"];
    for (const key in update) {
      if (!allowedUpdates.includes(key)) {
        throw new NotAllowedError(`Cannot update '${key}' field!`);
      }
    }
  }

  private hasUser(user: ObjectId, userArray: ObjectId[]) {
    const userStr = user.toString();
    return userArray.some((id) => id.toString() === userStr);
  }
}

export class PostAuthorNotMatchError extends NotAllowedError {
  constructor(
    public readonly author: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} is not the author of post {1}!", author, _id);
  }
}

export class PostUserAlreadyRestrictedError extends NotAllowedError {
  constructor(
    public readonly user: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} is already restricted for post {1}!", user, _id);
  }
}

export class PostUserAlreadyUnrestrictedError extends NotAllowedError {
  constructor(
    public readonly user: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} is already unrestricted for post {1}!", user, _id);
  }
}

export class RestrictedPostAccessError extends NotAllowedError {
  constructor(
    public readonly user: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} is not allowed to view post {1}!", user, _id);
  }
}
