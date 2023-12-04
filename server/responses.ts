import { User } from "./app";
import { BookmarkDoc } from "./concepts/bookmark";
import { AlreadyFriendsError, FriendNotFoundError, FriendRequestAlreadyExistsError, FriendRequestDoc, FriendRequestNotFoundError } from "./concepts/friend";
import { GatheringDoc, InviteDoc } from "./concepts/gathering";
import { MessageDoc } from "./concepts/message";
import { PostAuthorNotMatchError, PostDoc } from "./concepts/post";
import { Router } from "./framework/router";

/**
 * This class does useful conversions for the frontend.
 * For example, it converts a {@link PostDoc} into a more readable format for the frontend.
 */
export default class Responses {
  /**
   * Convert PostDoc into more readable format for the frontend by converting the author id into a username.
   */
  static async post(post: PostDoc | null) {
    if (!post) {
      return post;
    }
    const author = await User.getUserById(post.author);
    return { ...post, author: author.username };
  }

  /**
   * Same as {@link post} but for an array of PostDoc for improved performance.
   */
  static async posts(posts: PostDoc[]) {
    const authors = await User.idsToUsernames(posts.map((post) => post.author));
    return posts.map((post, i) => ({ ...post, author: authors[i] }));
  }

  /**
   * Convert FriendRequestDoc into more readable format for the frontend
   * by converting the ids into usernames.
   */
  static async friendRequests(requests: FriendRequestDoc[]) {
    const from = requests.map((request) => request.from);
    const to = requests.map((request) => request.to);
    const usernames = await User.idsToUsernames(from.concat(to));
    return requests.map((request, i) => ({ ...request, from: usernames[i], to: usernames[i + requests.length] }));
  }

  /**
   * Convert Bookmark doc into more readable format for the frontend by converting the author id into a username.
   */
  static async bookmark(bookmark: BookmarkDoc | null) {
    if (!bookmark) {
      return bookmark;
    }
    const url = bookmark.destination;
    return { ...bookmark, destination: url };
  }

  /**
   * Convert Bookmark docs into more readable format for the frontend by converting the author id into a username.
   */
  static async bookmarks(bookmarkArray: BookmarkDoc[]) {
    const urls = bookmarkArray.map((bookmark) => bookmark.destination);
    return bookmarkArray.map((bookmark, i) => ({ ...bookmark, destination: urls[i] }));
  }

  /**
   * Convert Gathering doc into more readable format for the frontend by converting the creator, host, and acceptor ids into usernames.
   */
  static async gathering(gathering: GatheringDoc | null) {
    if (!gathering) {
      return gathering;
    }
    // const creator = (await User.getUserById(gathering.creator)).username;
    const creator = (await User.idsToUsernames([gathering.creator]))[0];
    const hosts = await User.idsToUsernames(gathering.hosts);
    // const hosts = await Promise.all(gathering.hosts.map(async (host) => (await User.getUserById(host)).username));
    const acceptors = gathering.acceptors ? await User.idsToUsernames(gathering.acceptors) : gathering.acceptors;
    // const acceptors = gathering.acceptors ? await Promise.all(gathering.acceptors.map(async (acceptor) => (await User.getUserById(acceptor)).username)) : gathering.acceptors;
    return { ...gathering, creator, hosts, acceptors };
  }

  /**
   * Convert Gathering docs into more readable format for the frontend by converting the creator, host, and acceptor ids into usernames.
   */
  static async gatherings(gatheringArray: GatheringDoc[]) {
    const changedFields = await Promise.all(
      gatheringArray.map(async (gathering) => {
        const creator = (await User.idsToUsernames([gathering.creator]))[0];
        const hosts = await User.idsToUsernames(gathering.hosts);
        const acceptors = gathering.acceptors ? await User.idsToUsernames(gathering.acceptors) : gathering.acceptors;
        return { creator, hosts, acceptors };
      }),
    );

    return gatheringArray.map((gathering, i) => ({
      ...gathering,
      creator: changedFields[i].creator,
      hosts: changedFields[i].hosts,
      acceptors: changedFields[i].acceptors,
    }));
  }

  /**
   * Convert Invite doc into more readable format for the frontend by converting the from and to ids into usernames.
   */
  static async invite(invite: InviteDoc | null) {
    if (!invite) {
      return invite;
    }
    const to = (await User.idsToUsernames([invite.to]))[0];
    const from = (await User.idsToUsernames([invite.from]))[0];
    return { ...invite, to, from };
  }

  /**
   * Convert Invite docs into more readable format for the frontend by converting the from and to ids into usernames.
   */
  static async invites(inviteArray: InviteDoc[]) {
    const changedFields = await Promise.all(
      inviteArray.map(async (invite) => {
        const to = (await User.idsToUsernames([invite.to]))[0];
        const from = (await User.idsToUsernames([invite.from]))[0];
        return { to, from };
      }),
    );

    return inviteArray.map((invite, i) => ({
      ...invite,
      to: changedFields[i].to,
      from: changedFields[i].from,
    }));
  }

  /**
   * Convert Message doc into more readable format for the frontend by converting the from and to ids into usernames.
   */
  static async message(message: MessageDoc | null) {
    if (!message) {
      return message;
    }
    const to = (await User.idsToUsernames([message.to]))[0];
    const from = (await User.idsToUsernames([message.from]))[0];
    return { ...message, to, from };
  }

  /**
   * Convert Message docs into more readable format for the frontend by converting the from and to ids into usernames.
   */
  static async messages(messageArray: MessageDoc[]) {
    const changedFields = await Promise.all(
      messageArray.map(async (message) => {
        const to = (await User.idsToUsernames([message.to]))[0];
        const from = (await User.idsToUsernames([message.from]))[0];
        return { to, from };
      }),
    );

    return messageArray.map((message, i) => ({
      ...message,
      to: changedFields[i].to,
      from: changedFields[i].from,
    }));
  }
}

Router.registerError(PostAuthorNotMatchError, async (e) => {
  const username = (await User.getUserById(e.author)).username;
  return e.formatWith(username, e._id);
});

Router.registerError(FriendRequestAlreadyExistsError, async (e) => {
  const [user1, user2] = await Promise.all([User.getUserById(e.from), User.getUserById(e.to)]);
  return e.formatWith(user1.username, user2.username);
});

Router.registerError(FriendNotFoundError, async (e) => {
  const [user1, user2] = await Promise.all([User.getUserById(e.user1), User.getUserById(e.user2)]);
  return e.formatWith(user1.username, user2.username);
});

Router.registerError(FriendRequestNotFoundError, async (e) => {
  const [user1, user2] = await Promise.all([User.getUserById(e.from), User.getUserById(e.to)]);
  return e.formatWith(user1.username, user2.username);
});

Router.registerError(AlreadyFriendsError, async (e) => {
  const [user1, user2] = await Promise.all([User.getUserById(e.user1), User.getUserById(e.user2)]);
  return e.formatWith(user1.username, user2.username);
});
