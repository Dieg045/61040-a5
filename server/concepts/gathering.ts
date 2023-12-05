import { Filter, ObjectId } from "mongodb";
import DocCollection, { BaseDoc } from "../framework/doc";
import { NotAllowedError, NotFoundError } from "./errors";

export interface GatheringDoc extends BaseDoc {
  title: string;
  description: string;
  creator: ObjectId;
  acceptors?: ObjectId[];
  posts?: Array<ObjectId>;
}

export interface InviteDoc extends BaseDoc {
  gathering: ObjectId;
  from: ObjectId;
  to: ObjectId;
  status: "pending" | "declined" | "accepted";
}

export default class GatheringConcept {
  public readonly gatherings = new DocCollection<GatheringDoc>("gatherings");
  public readonly invites = new DocCollection<InviteDoc>("invites");

  async getGatherings(query: Filter<GatheringDoc>) {
    const posts = await this.gatherings.readMany(query, {
      sort: { dateUpdated: -1 },
    });
    return posts;
  }

  async getById(_id: ObjectId) {
    const gathering = await this.gatherings.readOne({ _id });
    if (gathering === null) {
      throw new NotFoundError(`Gathering not found!`);
    }
    return gathering;
  }

  async getByCreator(user: ObjectId) {
    const gatherings = await this.gatherings.readMany({ creator: user });
    return gatherings;
  }

  async create(creator: ObjectId, title: string, description: string) {
    await this.isAvailableTitle(creator, title);
    const _id = await this.gatherings.createOne({ creator, title, description });
    return { msg: "Gathering created successfully!", gathering: await this.gatherings.readOne({ _id }) };
  }

  async delete(_id: ObjectId) {
    const invite = await this.invites.readOne({ gathering: _id });
    if (invite) {
      throw new NotAllowedError("Cannot delete a gathering that already has invitees. Can only cancel gathering.");
    }

    await this.gatherings.deleteOne({ _id });
    return { msg: "Gathering deleted!" };
  }

  async update(_id: ObjectId, update: Partial<GatheringDoc>) {
    this.sanitizeUpdate(update);
    await this.gatherings.updateOne({ _id }, update);
    return { msg: "Gathering successfully updated!" };
  }

  async addAcceptor(_id: ObjectId, user: ObjectId) {
    const gathering = await this.gatherings.readOne({ _id });
    if (!gathering) {
      throw new NotFoundError(`Post ${_id} does not exist!`);
    }

    const newAcceptors = [user]; //might want to make this change in posts too
    if (gathering.acceptors) {
      if (this.hasItem(user, gathering.acceptors)) {
        throw new AlreadyAcceptedInviteError(user, _id);
      } else {
        newAcceptors.concat(gathering.acceptors);
      }
    }
    const update = { acceptors: newAcceptors };

    this.sanitizeUpdate(update);
    await this.gatherings.updateOne({ _id }, update);
    return { msg: "Gathering successfully updated!" };
  }

  async removeAcceptor(_id: ObjectId, user: ObjectId) {
    const gathering = await this.gatherings.readOne({ _id });
    if (!gathering) {
      throw new NotFoundError(`Post ${_id} does not exist!`);
    }

    const newAcceptors: ObjectId[] = []; //might want to make this change in posts too
    if (gathering.acceptors) {
      const userStr = user.toString();
      const userFilteredOut = gathering.acceptors.filter((id) => id.toString() !== userStr);
      if (userFilteredOut.length === gathering.acceptors.length) {
        throw new InviteNotAcceptedError(user, _id);
      }

      newAcceptors.concat(userFilteredOut);
    }
    const update = { acceptors: newAcceptors };

    this.sanitizeUpdate(update);
    await this.gatherings.updateOne({ _id }, update);
    return { msg: "Gathering successfully updated!" };
  }

  async canView(user: ObjectId, _id: ObjectId) {
    try {
      await this.isCreator(user, _id);
    } catch (GatheringHostNotMatchError) {
      await this.isAcceptor(user, _id);
    }
  }

  async isCreator(user: ObjectId, _id: ObjectId) {
    const gathering = await this.gatherings.readOne({ _id });
    if (!gathering) {
      throw new NotFoundError(`Gathering ${_id} does not exist!`);
    }
    if (gathering.creator.toString() !== user.toString()) {
      throw new GatheringCreatorNotMatchError(user, _id);
    }
  }

  async isInvited(user: ObjectId, _id: ObjectId) {
    const invite = await this.invites.readOne({ gathering: _id, to: user });
    if (!invite) {
      throw new NotInvitedError(user, _id);
    }
  }

  async isAcceptor(user: ObjectId, _id: ObjectId) {
    const gathering = await this.gatherings.readOne({ _id });
    if (!gathering) {
      throw new NotFoundError(`Gathering ${_id} does not exist!`);
    }
    await this.isInvited(user, _id);
    if (!gathering.acceptors || !this.hasItem(user, gathering.acceptors)) {
      throw new PendingInviteError(user, _id);
    }
  }

  async getInvites(query: Filter<InviteDoc>) {
    const invites = await this.invites.readMany(query, {
      sort: { dateUpdated: -1 },
    });
    return invites;
  }

  async inviteMany(from: ObjectId, to: ObjectId[], gathering: ObjectId) {
    for (const guest of to) {
      await this.canInvite(guest, gathering);
      await this.invites.createOne({ gathering, from, to: guest, status: "pending" });
    }
    return { msg: "Sent invites!" };
  }

  async invite(from: ObjectId, to: ObjectId, gathering: ObjectId) {
    await this.canInvite(to, gathering);
    const _id = await this.invites.createOne({ gathering, from, to, status: "pending" });
    return { msg: "Sent invite!", invite: await this.invites.readOne({ _id }) };
  }

  async acceptInvite(to: ObjectId, gathering: ObjectId) {
    const invite = await this.invites.readOne({ to, gathering });
    if (!invite) {
      throw new NotInvitedError(to, gathering);
    }
    if (invite.status === "accepted") {
      throw new AlreadyAcceptedInviteError(to, gathering);
    }
    await this.removeInvite(invite.from, to, gathering);

    // Following two can be done in parallel, thus we use `void`
    void this.invites.createOne({ from: invite.from, to, gathering, status: "accepted" });
    void this.addAcceptor(gathering, to);
    return { msg: "Accepted invite!" };
  }

  async declineInvite(to: ObjectId, gathering: ObjectId) {
    const invite = await this.invites.readOne({ to, gathering });
    if (!invite) {
      throw new NotInvitedError(to, gathering);
    }
    if (invite.status === "declined") {
      throw new AlreadyDeclinedInviteError(to, gathering);
    } else if (invite.status === "accepted") {
      await this.removeAcceptor(gathering, to);
    }
    await this.removeInvite(invite.from, to, gathering);

    // Following two can be done in parallel, thus we use `void`
    void this.invites.createOne({ from: invite.from, to, gathering, status: "declined" });
    return { msg: "Declined invite." };
  }

  async associatePost(_id: ObjectId, post: ObjectId) {
    const gathering = await this.gatherings.readOne({ _id });
    if (!gathering) {
      throw new NotFoundError(`Gathering ${_id} does not exist!`);
    }

    const newPosts = [post]; //might want to make this change in posts too
    if (gathering.posts) {
      if (this.hasItem(post, gathering.posts)) {
        throw new GatheringAlreadyHasPostError(post, _id);
      } else {
        newPosts.concat(gathering.posts);
      }
    }
    //might need to fix this! Perhaps need to use array instead
    const update = JSON.parse(`{ $set: { "acceptors" : ${newPosts} } }`);

    this.sanitizeUpdate(update);
    await this.gatherings.updateOne({ _id }, update);
    return { msg: "Gathering successfully updated!" };
  }

  async removePost(_id: ObjectId, post: ObjectId) {
    const gathering = await this.gatherings.readOne({ _id });
    if (!gathering) {
      throw new NotFoundError(`Post ${_id} does not exist!`);
    }

    const newPosts: ObjectId[] = []; //might want to make this change in posts too
    if (gathering.posts) {
      const postStr = post.toString();
      const postFilteredOut = gathering.posts.filter((id) => id.toString() !== postStr);
      if (postFilteredOut.length === gathering.posts.length) {
        throw new PostNotAddedToGatheringError(post, _id);
      }

      newPosts.concat(postFilteredOut);
    }
    //might need to fix this! Perhaps need to use array instead
    const update = JSON.parse(`{ $set: { "acceptors" : ${newPosts} } }`);

    this.sanitizeUpdate(update);
    await this.gatherings.updateOne({ _id }, update);
    return { msg: "Gathering successfully updated!" };
  }

  private async isAvailableTitle(creator: ObjectId, title: string) {
    if (await this.gatherings.readOne({ creator, title })) {
      throw new GatheringNameAlreadyInUseError(creator, title);
    }
  }

  private sanitizeUpdate(update: Partial<GatheringDoc>) {
    // Make sure the update cannot change the creator or hosts.
    const allowedUpdates = ["title", "description", "canceled", "acceptors", "posts"];
    for (const key in update) {
      if (!allowedUpdates.includes(key)) {
        throw new NotAllowedError(`Cannot update '${key}' field!`);
      }
    }
  }

  private hasItem(item: ObjectId, array: ObjectId[]) {
    const itemStr = item.toString();
    return array.some((id) => id.toString() === itemStr);
  }

  private async canInvite(to: ObjectId, gathering: ObjectId) {
    // check if there is pending request between these users
    const invite = await this.invites.readOne({ gathering, to });
    if (invite !== null) {
      throw new InviteAlreadyExistsError(to, gathering);
    }
  }

  private async removeInvite(from: ObjectId, to: ObjectId, gathering: ObjectId) {
    const invite = await this.invites.popOne({ from, to, gathering });
    if (invite === null) {
      throw new NotInvitedError(from, to);
    }
    return invite;
  }
}

export class GatheringNameAlreadyInUseError extends NotAllowedError {
  constructor(
    public readonly creator: ObjectId,
    public readonly name: string,
  ) {
    super("{0} already has a gathering named {1}!", creator, name);
  }
}

export class GatheringAlreadyCanceledError extends NotAllowedError {
  constructor(public readonly gathering: ObjectId) {
    super("{0} is already canceled!", gathering);
  }
}

export class GatheringHostAlreadyExistsError extends NotAllowedError {
  constructor(
    public readonly user: ObjectId,
    public readonly gathering: ObjectId,
  ) {
    super("Gathering {0} already has user {1} as a host!", gathering, user);
  }
}

export class GatheringCreatorNotMatchError extends NotAllowedError {
  constructor(
    public readonly creator: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} is not the creator of gathering {1}!", creator, _id);
  }
}

export class NotInvitedError extends NotAllowedError {
  constructor(
    public readonly user: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} has not been invited to gathering {1}!", user, _id);
  }
}

export class PendingInviteError extends NotAllowedError {
  constructor(
    public readonly user: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} has not accepted their invite to gathering {1}!", user, _id);
  }
}

export class InviteAlreadyExistsError extends NotAllowedError {
  constructor(
    public readonly to: ObjectId,
    public readonly gathering: ObjectId,
  ) {
    super("{0} has already been invited to gathering {1}!", to, gathering);
  }
}

export class AlreadyAcceptedInviteError extends NotAllowedError {
  constructor(
    public readonly to: ObjectId,
    public readonly gathering: ObjectId,
  ) {
    super("{0} has already accepted their invite to gathering {1}!", to, gathering);
  }
}

export class AlreadyDeclinedInviteError extends NotAllowedError {
  constructor(
    public readonly to: ObjectId,
    public readonly gathering: ObjectId,
  ) {
    super("{0} has already declined their invite to gathering {1}!", to, gathering);
  }
}

export class InviteNotAcceptedError extends NotAllowedError {
  constructor(
    public readonly user: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} has not currently accepted their invite to gathering {1}!", user, _id);
  }
}

export class GatheringAlreadyHasPostError extends NotAllowedError {
  constructor(
    public readonly post: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} has already been added to gathering {1}!", post, _id);
  }
}

export class PostNotAddedToGatheringError extends NotAllowedError {
  constructor(
    public readonly post: ObjectId,
    public readonly _id: ObjectId,
  ) {
    super("{0} is not currently added to gathering {1}!", post, _id);
  }
}
