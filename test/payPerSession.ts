import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { PayPerSession } from '../typechain-types';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

const REGISTER_FEE = ethers.utils.parseEther('10.0');
const ONE_GLMR = ethers.utils.parseEther('1.0');

async function factory(): Promise<PayPerSession> {
  const payPerSessionFactory = await ethers.getContractFactory('PayPerSession');
  const payPerSession: PayPerSession = await payPerSessionFactory.deploy(
    'Pay per session',
    'Test platform description',
    500,
    REGISTER_FEE,
  );

  await payPerSession.deployed();
  return payPerSession;
}

describe('Pay Per Session', async () => {
  let payPerSession: PayPerSession;
  let addrs: SignerWithAddress[];
  let owner: SignerWithAddress;
  let beneficiary: SignerWithAddress;
  let producer1: SignerWithAddress;
  let producer2: SignerWithAddress;
  let consumer1: SignerWithAddress;
  let consumer2: SignerWithAddress;

  beforeEach(async function () {
    [owner, beneficiary, producer1, producer2, consumer1, consumer2, ...addrs] =
      await ethers.getSigners();
    payPerSession = await loadFixture(factory);
  });

  it('can get contract config', async () => {
    expect(await payPerSession.getName()).to.eql('Pay per session');
    expect(await payPerSession.getDescription()).to.eql('Test platform description');
    expect(await payPerSession.getFeeInBasePoints()).to.eql(bn(500));
    expect(await payPerSession.getRegisterPayment()).to.eql(REGISTER_FEE);
  });

  it('can update register fee', async () => {
    await payPerSession.connect(owner).updateRegisterPayment(REGISTER_FEE.mul(2));
    expect(await payPerSession.getRegisterPayment()).to.eql(REGISTER_FEE.mul(2));
  });

  it('can update platorm fee', async () => {
    await payPerSession.connect(owner).updatePlatformFee(1000); // 10%
    expect(await payPerSession.getFeeInBasePoints()).to.eql(bn(1000));
  });

  it('producer can register by paying fee', async () => {
    expect(await payPerSession.isProducer(producer1.address)).to.eql(false);
    await payPerSession
      .connect(producer1)
      .register('video', 'games and related', { value: REGISTER_FEE });
    expect(await payPerSession.isProducer(producer1.address)).to.eql(true);
  });

  it('producer cannot register twice', async () => {
    await payPerSession
      .connect(producer1)
      .register('video', 'games and related', { value: REGISTER_FEE });
    await expect(
      payPerSession
        .connect(producer1)
        .register('video', 'games and related', { value: REGISTER_FEE }),
    ).to.be.revertedWithCustomError(payPerSession, 'AlreadyRegistered');
  });

  it('producer cannot without paying the right fee', async () => {
    await expect(
      payPerSession.register('video', 'games and related', { value: REGISTER_FEE.div(2) }),
    ).to.be.revertedWithCustomError(payPerSession, 'IncorrectRegisterPayment');
  });

  describe('With producers', async () => {
    beforeEach(async function () {
      await payPerSession
        .connect(producer1)
        .register('video', 'games and related', { value: REGISTER_FEE });
      await payPerSession
        .connect(producer2)
        .register('text', 'crypto and related', { value: REGISTER_FEE });
    });

    it('can list producers', async () => {
      expect(await payPerSession.producers()).to.eql([
        [producer1.address, 'video', 'games and related'],
        [producer2.address, 'text', 'crypto and related'],
      ]);
    });

    it('producer can add categories', async () => {
      await payPerSession.connect(producer1).addCategory(
        'Games',
        'All about games',
        ONE_GLMR,
        86400, // 24h
      );
      await payPerSession.connect(producer1).addCategory(
        'Crypto',
        'All about crypto',
        ONE_GLMR.mul(2),
        3600, // 1h
      );
      expect(await payPerSession.producerCategories(producer1.address)).to.eql([
        ['Games', 'All about games', ONE_GLMR, bn(86400)],
        ['Crypto', 'All about crypto', ONE_GLMR.mul(2), bn(3600)],
      ]);
    });

    describe('With Categories and Content', async () => {
      beforeEach(async function () {
        await payPerSession.connect(producer1).addCategory(
          'Games',
          'All about games',
          ONE_GLMR,
          86400, // 24h
        );
        await payPerSession.connect(producer2).addCategory(
          'Crypto',
          'All about crypto',
          ONE_GLMR.mul(2),
          3600, // 1h
        );

        await payPerSession.connect(producer1).addContent('Games', 'ipfs://gameContent');
        await payPerSession.connect(producer1).addContent('Games', 'ipfs://gameContent2');
        await payPerSession.connect(producer2).addContent('Crypto', 'ipfs://cryptoContent');
      });

      it('non producer cannot add categories nor content', async () => {
        await expect(
          payPerSession.connect(consumer1).addContent('Games', 'ipfs://gameContent'),
        ).to.be.revertedWithCustomError(payPerSession, 'NotRegistered');
        await expect(
          payPerSession.connect(consumer1).addCategory('test', 'desc', ONE_GLMR, 3600),
        ).to.be.revertedWithCustomError(payPerSession, 'NotRegistered');
      });

      it('cannot add content in other producer category', async () => {
        await expect(
          payPerSession.connect(producer2).addContent('Games', 'ipfs://gameContent'),
        ).to.be.revertedWithCustomError(payPerSession, 'CategoryNotFound');
      });

      it('can list producer categories', async () => {
        expect(await payPerSession.producerCategories(producer1.address)).to.eql([
          ['Games', 'All about games', ONE_GLMR, bn(86400)],
        ]);
      });

      it('user cannot activate session without paying the right fee', async () => {
        await expect(
          payPerSession.connect(consumer1).activateSession(producer1.address, 'Games'),
        ).to.be.revertedWithCustomError(payPerSession, 'IncorrectSessionFee');
      });

      describe('With active users', async () => {
        beforeEach(async function () {
          await payPerSession
            .connect(consumer1)
            .activateSession(producer1.address, 'Games', { value: ONE_GLMR });
          await payPerSession
            .connect(consumer2)
            .activateSession(producer2.address, 'Crypto', { value: ONE_GLMR.mul(2) });
        });

        it('can list categories content', async () => {
          expect(await payPerSession.isSessionActive(consumer1.address, producer1.address, 'Games')).to.eql(true);
          expect(
            await payPerSession.getContent(consumer1.address, producer1.address, 'Games'),
          ).to.eql(['ipfs://gameContent', 'ipfs://gameContent2']);

          // Consumer 2 is not registered for producer 1
          await expect(
            payPerSession.getContent(consumer2.address, producer1.address, 'Games'),
          ).to.be.revertedWithCustomError(payPerSession, 'InactiveSession');
        });

        it('producer can claim royalties', async () => {
          // Session fee is 1GLMR -5% comission (100/20 -> 5%)
          const expectedRoyalties = ONE_GLMR.sub(ONE_GLMR.div(20));
          expect(await payPerSession.producerClaimableRoyalties(producer1.address)).to.eql(
            expectedRoyalties
          );
          const beneficiaryAddr = addrs[0].address;
          const initBalance = await ethers.provider.getBalance(beneficiaryAddr);
          await payPerSession.connect(producer1).claimProducerRoyalties(beneficiaryAddr);
          expect(await ethers.provider.getBalance(beneficiaryAddr)).to.eql(initBalance.add(expectedRoyalties));

          // Can't withdraw anymore
          expect(await payPerSession.producerClaimableRoyalties(producer1.address)).to.eql(
            bn(0)
          );
          await expect(
            payPerSession.connect(producer1).claimProducerRoyalties(beneficiaryAddr),
          ).to.be.revertedWithCustomError(payPerSession, 'NothingToWithdraw');
        });

        it('not owner cannot claim platform fee', async () => {
          await expect(
            payPerSession.connect(producer1).claimPlatformRoyalties(addrs[0].address),
          ).to.be.revertedWithCustomError(payPerSession, 'NotOwner');
        });

        it('platform can claim fee', async () => {
          // 2 Registration fees + platform fee from is 1GLMR + platform fee from is 2GLMR
          const expectedRoyalties = REGISTER_FEE.mul(2).add(ONE_GLMR.div(20)).add(ONE_GLMR.div(10));
          expect(await payPerSession.platformClaimableRoyalties()).to.eql(
            expectedRoyalties
          );
          const beneficiaryAddr = addrs[0].address;
          const initBalance = await ethers.provider.getBalance(beneficiaryAddr);
          await payPerSession.connect(owner).claimPlatformRoyalties(beneficiaryAddr);
          expect(await ethers.provider.getBalance(beneficiaryAddr)).to.eql(initBalance.add(expectedRoyalties));

          // Can't withdraw anymore
          expect(await payPerSession.platformClaimableRoyalties()).to.eql(
            bn(0)
          );
          await expect(
            payPerSession.connect(owner).claimPlatformRoyalties(beneficiaryAddr),
          ).to.be.revertedWithCustomError(payPerSession, 'NothingToWithdraw');
        });
      });
    });
  });
});

function bn(value: number): BigNumber {
  return BigNumber.from(value);
}
